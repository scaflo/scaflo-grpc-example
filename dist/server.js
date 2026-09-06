import * as grpc2 from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import express, { Router } from 'express';
import { renderSSR } from '@scaflo/node-react-wrapper';
import { useState, useRef, useEffect } from 'react';
import { jsxs, jsx } from 'react/jsx-runtime';

// src/services/grpc/server.ts

// src/data/mockData.ts
var PRODUCTS = {
  "P001": {
    product_id: "P001",
    name: "Mechanical Keyboard Pro",
    category: "Electronics",
    price: 149.99,
    stock: 42,
    description: "Tactile 87-key mechanical keyboard with RGB backlight and Cherry MX switches."
  },
  "P002": {
    product_id: "P002",
    name: "Ergonomic Mouse",
    category: "Electronics",
    price: 79.99,
    stock: 85,
    description: "Vertical ergonomic mouse with 6 programmable buttons and silent click."
  },
  "P003": {
    product_id: "P003",
    name: '4K Monitor 27"',
    category: "Electronics",
    price: 499,
    stock: 18,
    description: "IPS panel with 144Hz refresh rate, HDR400, and USB-C power delivery."
  },
  "P004": {
    product_id: "P004",
    name: "Laptop Stand",
    category: "Accessories",
    price: 39.99,
    stock: 200,
    description: "Aluminium adjustable laptop stand, fits 11\u201317 inch laptops."
  },
  "P005": {
    product_id: "P005",
    name: "Noise Cancelling Headphones",
    category: "Audio",
    price: 299,
    stock: 33,
    description: "Over-ear ANC headphones with 30hr battery and Hi-Res Audio support."
  }
};
var ORDERS = {
  "ORD-001": { order_id: "ORD-001", product_id: "P001", quantity: 2, customer: "Alice" },
  "ORD-002": { order_id: "ORD-002", product_id: "P003", quantity: 1, customer: "Bob" },
  "ORD-003": { order_id: "ORD-003", product_id: "P005", quantity: 3, customer: "Carol" }
};
var ORDER_STAGES = [
  { status: 1, label: "RECEIVED", message: "Your order has been received and confirmed.", progressPct: 10, delayMs: 500 },
  { status: 2, label: "PROCESSING", message: "Payment verified. Picking items from warehouse.", progressPct: 30, delayMs: 1e3 },
  { status: 3, label: "PACKED", message: "Items packed and ready for dispatch.", progressPct: 50, delayMs: 1e3 },
  { status: 4, label: "SHIPPED", message: "Package handed over to courier partner.", progressPct: 70, delayMs: 1500 },
  { status: 5, label: "OUT_FOR_DELIVERY", message: "Your package is out for delivery nearby you.", progressPct: 90, delayMs: 1e3 },
  { status: 6, label: "DELIVERED", message: "Package delivered successfully.", progressPct: 100, delayMs: 500 }
];
var BOT_REPLIES = {
  hello: "Hello. How can I help you today?",
  hi: "Hello. Welcome to support. What do you need help with?",
  order: "To track your order, please share your order ID (e.g. ORD-001).",
  "ORD-001": "Order ORD-001: Currently shipped, expected delivery tomorrow by 6 PM.",
  "ORD-002": "Order ORD-002: Delivered on time to Bob. Let us know if you need a return.",
  "ORD-003": "Order ORD-003: Still processing. 3 units of Headphones are being packed.",
  refund: "For refunds, please allow 3-5 business days once initiated. Shall I process it?",
  yes: "Confirmed. Initiating your refund now. You will receive a confirmation shortly.",
  no: "Understood. No action taken. Is there anything else I can help you with?",
  thanks: "You are welcome. Have a great day.",
  bye: "Goodbye. Feel free to contact support anytime."
};
function getBotReply(userText) {
  const lower = userText.toLowerCase().trim();
  for (const [key, reply] of Object.entries(BOT_REPLIES)) {
    if (lower.includes(key.toLowerCase())) return reply;
  }
  return `I understand you said: "${userText}". Let me connect you to a human agent for better assistance.`;
}
function findProduct(id) {
  return PRODUCTS[id];
}
function findOrder(id) {
  return ORDERS[id];
}
function now() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/services/grpc/handlers.ts
function getProduct(call, callback) {
  const { product_id } = call.request;
  const product = findProduct(product_id);
  if (!product) {
    callback({
      code: 5,
      // grpc.status.NOT_FOUND
      message: `Product "${product_id}" not found. Available: P001\u2013P005`
    });
    return;
  }
  callback(null, product);
}
function trackOrder(call) {
  const { order_id } = call.request;
  const order = findOrder(order_id);
  if (!order) {
    call.emit("error", {
      code: 5,
      // NOT_FOUND
      message: `Order "${order_id}" not found. Try ORD-001, ORD-002, ORD-003`
    });
    return;
  }
  let stageIndex = 0;
  const sendNextStage = () => {
    if (stageIndex >= ORDER_STAGES.length) {
      call.end();
      return;
    }
    const stage = ORDER_STAGES[stageIndex];
    if (!stage) {
      call.end();
      return;
    }
    const update = {
      order_id,
      status: stage.status,
      message: stage.message,
      timestamp: now(),
      progress: stage.progressPct
    };
    call.write(update);
    stageIndex++;
    setTimeout(sendNextStage, stage.delayMs);
  };
  sendNextStage();
}
function recordMetrics(call, callback) {
  const pings = [];
  call.on("data", (ping) => {
    pings.push(ping.value);
  });
  call.on("end", () => {
    if (pings.length === 0) {
      callback({ code: 3, message: "No metrics received in stream." });
      return;
    }
    const total = pings.reduce((a, b) => a + b, 0);
    const summary = {
      total_pings: pings.length,
      average_value: total / pings.length,
      min_value: Math.min(...pings),
      max_value: Math.max(...pings),
      total_value: total,
      processed_at: now()
    };
    callback(null, summary);
  });
  call.on("error", (err) => {
    console.error("[Client Stream] Stream error:", err.message);
  });
}
function liveSupport(call) {
  call.on("data", (msg) => {
    const replyText = getBotReply(msg.text);
    const reply = {
      sender: "SupportBot",
      text: replyText,
      timestamp: now(),
      is_bot: true
    };
    call.write(reply);
  });
  call.on("end", () => {
    call.write({
      sender: "SupportBot",
      text: "Thanks for contacting support. Have a great day! Session closed.",
      timestamp: now(),
      is_bot: true
    });
    call.end();
  });
  call.on("error", (err) => {
    console.error("[Bidi Stream] Error:", err.message);
  });
}
var __filename$1 = fileURLToPath(import.meta.url);
var __dirname$1 = path.dirname(__filename$1);
var relativeProto = path.resolve(__dirname$1, "../../../proto/ecommerce.proto");
var PROTO_PATH = fs.existsSync(relativeProto) ? relativeProto : path.resolve(process.cwd(), "proto/ecommerce.proto");
var packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
var proto = grpc2.loadPackageDefinition(packageDefinition);

// src/services/grpc/server.ts
function createGrpcServer() {
  const server = new grpc2.Server();
  const handlers = {
    GetProduct: getProduct,
    TrackOrder: trackOrder,
    RecordMetrics: recordMetrics,
    LiveSupport: liveSupport
  };
  server.addService(proto.ecommerce.InventoryService.service, handlers);
  return server;
}
function startGrpcServer(port = 50051) {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer();
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc2.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`[grpc] server listening on :${boundPort}`);
        resolve(server);
      }
    );
  });
}
function App() {
  const [activeTab, setActiveTab] = useState("all");
  const [toastMsg, setToastMsg] = useState(null);
  const [productId, setProductId] = useState("P001");
  const [unaryOutput, setUnaryOutput] = useState(null);
  const [unaryLoading, setUnaryLoading] = useState(false);
  const [orderId, setOrderId] = useState("ORD-001");
  const [orderProgress, setOrderProgress] = useState(0);
  const [orderLogs, setOrderLogs] = useState([]);
  const [ssStreaming, setSsStreaming] = useState(false);
  const eventSourceRef = useRef(null);
  const [metricsBody, setMetricsBody] = useState(JSON.stringify({
    pings: [
      { metric_name: "cpu_usage", value: 72.5, unit: "%" },
      { metric_name: "memory_mb", value: 1024, unit: "MB" },
      { metric_name: "response_ms", value: 143, unit: "ms" }
    ]
  }, null, 2));
  const [csOutput, setCsOutput] = useState(null);
  const [csLoading, setCsLoading] = useState(false);
  const [bidiBody, setBidiBody] = useState(JSON.stringify({
    sender: "Alice",
    messages: ["hello", "order", "ORD-001", "thanks", "bye"]
  }, null, 2));
  const [bidiChat, setBidiChat] = useState([]);
  const [bidiLoading, setBidiLoading] = useState(false);
  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };
  const copyText = (text) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
    }
  };
  const handleCallUnary = async () => {
    const id = productId.trim() || "P001";
    setUnaryLoading(true);
    setUnaryOutput(null);
    const start = performance.now();
    try {
      const res = await fetch(`/api/grpc/product/${id}`);
      const data = await res.json();
      const latency = `${(performance.now() - start).toFixed(1)}ms`;
      if (res.ok) {
        setUnaryOutput({ status: "200 OK", statusCode: 200, data, latency });
      } else {
        setUnaryOutput({ status: `${res.status} ${res.statusText || "Error"}`, statusCode: res.status, error: data.error ?? "Product not found", data, latency });
      }
    } catch (err) {
      const e = err;
      setUnaryOutput({ status: "Network Error", statusCode: 500, error: e.message });
    } finally {
      setUnaryLoading(false);
    }
  };
  const handleCallServerStream = () => {
    const id = orderId.trim() || "ORD-001";
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setOrderProgress(0);
    setOrderLogs([`[Subscribing] Order "${id}"`]);
    setSsStreaming(true);
    const es = new EventSource(`/api/grpc/track/${id}`);
    eventSourceRef.current = es;
    es.onmessage = (event) => {
      try {
        const chunk = JSON.parse(event.data);
        if (chunk.done) {
          setOrderLogs((prev) => [...prev, `[Stream Ended] Delivery lifecycle complete`]);
          setSsStreaming(false);
          es.close();
          return;
        }
        if (chunk.error) {
          setOrderLogs((prev) => [...prev, `[Error] ${chunk.error}`]);
          setSsStreaming(false);
          es.close();
          return;
        }
        const pct = chunk.progress ?? 0;
        setOrderProgress(pct);
        const timeStr = chunk.timestamp ? chunk.timestamp.slice(11, 19) : "--:--:--";
        setOrderLogs((prev) => [
          ...prev,
          `[${timeStr}] [${pct}%] ${chunk.status}: ${chunk.message}`
        ]);
      } catch {
        setOrderLogs((prev) => [...prev, `[Event] ${event.data}`]);
      }
    };
    es.onerror = () => {
      setSsStreaming(false);
      es.close();
    };
  };
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
  const handleCallClientStream = async () => {
    let payload;
    try {
      payload = JSON.parse(metricsBody);
    } catch (err) {
      const e = err;
      setCsOutput({ status: "Bad Request", statusCode: 400, error: `Invalid JSON syntax: ${e.message}` });
      return;
    }
    setCsLoading(true);
    setCsOutput(null);
    try {
      const res = await fetch("/api/grpc/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setCsOutput({ status: "200 OK", statusCode: 200, data });
      } else {
        setCsOutput({ status: `${res.status} Error`, statusCode: res.status, error: data.error ?? "Failed to process stream", data });
      }
    } catch (err) {
      const e = err;
      setCsOutput({ status: "Network Error", statusCode: 500, error: e.message });
    } finally {
      setCsLoading(false);
    }
  };
  const handleCallBidiStream = async () => {
    let payload;
    try {
      payload = JSON.parse(bidiBody);
    } catch (err) {
      const e = err;
      setBidiChat([{ sender: "System", text: `Invalid JSON: ${e.message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false }]);
      return;
    }
    setBidiLoading(true);
    setBidiChat([]);
    try {
      const res = await fetch("/api/grpc/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (res.ok && Array.isArray(result.data)) {
        setBidiChat(result.data);
      } else {
        setBidiChat([{ sender: "System", text: `Error: ${result.error ?? "Unknown error"}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false }]);
      }
    } catch (err) {
      const e = err;
      setBidiChat([{ sender: "System", text: `Network Error: ${e.message}`, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false }]);
    } finally {
      setBidiLoading(false);
    }
  };
  return /* @__PURE__ */ jsxs("div", { className: "app-container", children: [
    /* @__PURE__ */ jsx("header", { className: "header", children: /* @__PURE__ */ jsxs("div", { className: "header-inner", children: [
      /* @__PURE__ */ jsxs("div", { className: "brand", children: [
        /* @__PURE__ */ jsx("div", { className: "brand-badge", children: "gRPC" }),
        /* @__PURE__ */ jsxs("div", { className: "brand-title", children: [
          /* @__PURE__ */ jsx("h1", { children: "API Explorer" }),
          /* @__PURE__ */ jsxs("p", { children: [
            /* @__PURE__ */ jsx("span", { className: "status-dot" }),
            " Core: 0.0.0.0:50051 \xB7 Gateway: :3000"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "header-meta", children: [
        /* @__PURE__ */ jsxs("div", { className: "meta-pill", children: [
          "Engine: ",
          /* @__PURE__ */ jsx("strong", { children: "React SSR" })
        ] }),
        /* @__PURE__ */ jsx("a", { href: "/static", target: "_blank", className: "nav-link-btn", children: "Schema Reference" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "filter-bar", children: [
      /* @__PURE__ */ jsx("button", { className: `filter-btn ${activeTab === "all" ? "active" : ""}`, onClick: () => setActiveTab("all"), children: "All Patterns" }),
      /* @__PURE__ */ jsx("button", { className: `filter-btn ${activeTab === "unary" ? "active" : ""}`, onClick: () => setActiveTab("unary"), children: "Unary RPC" }),
      /* @__PURE__ */ jsx("button", { className: `filter-btn ${activeTab === "ss" ? "active" : ""}`, onClick: () => setActiveTab("ss"), children: "Server Streaming" }),
      /* @__PURE__ */ jsx("button", { className: `filter-btn ${activeTab === "cs" ? "active" : ""}`, onClick: () => setActiveTab("cs"), children: "Client Streaming" }),
      /* @__PURE__ */ jsx("button", { className: `filter-btn ${activeTab === "bidi" ? "active" : ""}`, onClick: () => setActiveTab("bidi"), children: "Bidirectional Streaming" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid-container", children: [
      (activeTab === "all" || activeTab === "unary") && /* @__PURE__ */ jsxs("div", { className: "card", id: "card-unary", children: [
        /* @__PURE__ */ jsx("div", { className: "card-top", children: /* @__PURE__ */ jsxs("div", { className: "card-title-group", children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Unary RPC",
            /* @__PURE__ */ jsx("span", { className: "pattern-badge badge-unary", children: "GetProduct" })
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Single request produces a single response over HTTP/2." })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "card-content", children: [
          /* @__PURE__ */ jsxs("div", { className: "contract-bar", children: [
            /* @__PURE__ */ jsxs("div", { className: "endpoint-display", children: [
              /* @__PURE__ */ jsx("span", { className: "method-tag tag-get", children: "GET" }),
              /* @__PURE__ */ jsxs("span", { children: [
                "/api/grpc/product/",
                /* @__PURE__ */ jsx("strong", { children: productId })
              ] })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "proto-sig", children: "rpc GetProduct(GetProductRequest) returns (GetProductResponse)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "presets-row", children: [
            /* @__PURE__ */ jsx("span", { className: "presets-label", children: "Preset:" }),
            ["P001", "P002", "P003", "P005", "P999"].map((id) => /* @__PURE__ */ jsxs(
              "button",
              {
                className: `preset-chip ${productId === id ? "active" : ""}`,
                onClick: () => setProductId(id),
                children: [
                  id,
                  " ",
                  id === "P999" ? "(404)" : ""
                ]
              },
              id
            ))
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "input-row", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "field-input",
                value: productId,
                onChange: (e) => setProductId(e.target.value),
                placeholder: "Product ID (e.g. P001)"
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "btn-primary", onClick: handleCallUnary, disabled: unaryLoading, children: unaryLoading ? "Sending..." : "Send Request" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "console-box", children: [
            /* @__PURE__ */ jsxs("div", { className: "console-topbar", children: [
              /* @__PURE__ */ jsxs("div", { className: "console-label", children: [
                /* @__PURE__ */ jsx("span", { children: "Response" }),
                unaryOutput && /* @__PURE__ */ jsx("span", { className: `status-indicator ${unaryOutput.statusCode === 200 ? "status-success" : "status-error"}`, children: unaryOutput.status }),
                unaryOutput?.latency && /* @__PURE__ */ jsxs("span", { className: "status-latency", children: [
                  "\xB7 ",
                  unaryOutput.latency
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "console-controls", children: [
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => copyText(JSON.stringify(unaryOutput?.data ?? unaryOutput?.error, null, 2)), children: "Copy" }),
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => setUnaryOutput(null), children: "Clear" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "console-content", children: unaryOutput ? /* @__PURE__ */ jsx("pre", { style: { color: unaryOutput.statusCode === 200 ? "var(--text-primary)" : "var(--rose)" }, children: JSON.stringify(unaryOutput.data ?? { error: unaryOutput.error }, null, 2) }) : /* @__PURE__ */ jsx("span", { style: { color: "var(--text-muted)" }, children: "No response yet. Send a request to see output." }) })
          ] })
        ] })
      ] }),
      (activeTab === "all" || activeTab === "ss") && /* @__PURE__ */ jsxs("div", { className: "card", id: "card-ss", children: [
        /* @__PURE__ */ jsx("div", { className: "card-top", children: /* @__PURE__ */ jsxs("div", { className: "card-title-group", children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Server Streaming",
            /* @__PURE__ */ jsx("span", { className: "pattern-badge badge-ss", children: "TrackOrder" })
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Client initiates request; server pushes multiple lifecycle events via Server-Sent Events." })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "card-content", children: [
          /* @__PURE__ */ jsxs("div", { className: "contract-bar", children: [
            /* @__PURE__ */ jsxs("div", { className: "endpoint-display", children: [
              /* @__PURE__ */ jsx("span", { className: "method-tag tag-get", children: "GET" }),
              /* @__PURE__ */ jsxs("span", { children: [
                "/api/grpc/track/",
                /* @__PURE__ */ jsx("strong", { children: orderId })
              ] })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "proto-sig", children: "rpc TrackOrder(TrackOrderRequest) returns (stream TrackOrderResponse)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "presets-row", children: [
            /* @__PURE__ */ jsx("span", { className: "presets-label", children: "Orders:" }),
            ["ORD-001", "ORD-002", "ORD-003", "ORD-999"].map((id) => /* @__PURE__ */ jsx(
              "button",
              {
                className: `preset-chip ${orderId === id ? "active" : ""}`,
                onClick: () => setOrderId(id),
                children: id
              },
              id
            ))
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "input-row", children: [
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                className: "field-input",
                value: orderId,
                onChange: (e) => setOrderId(e.target.value),
                placeholder: "Order ID (e.g. ORD-001)"
              }
            ),
            /* @__PURE__ */ jsx("button", { className: "btn-primary", onClick: handleCallServerStream, disabled: ssStreaming, children: ssStreaming ? "Streaming..." : "Subscribe" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "progress-container", children: [
            /* @__PURE__ */ jsxs("div", { className: "progress-header", children: [
              /* @__PURE__ */ jsx("span", { children: "Lifecycle Progress" }),
              /* @__PURE__ */ jsxs("span", { children: [
                orderProgress,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "progress-track", children: /* @__PURE__ */ jsx("div", { className: "progress-fill", style: { width: `${orderProgress}%` } }) })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "console-box", children: [
            /* @__PURE__ */ jsxs("div", { className: "console-topbar", children: [
              /* @__PURE__ */ jsxs("div", { className: "console-label", children: [
                /* @__PURE__ */ jsx("span", { children: "Stream Events" }),
                ssStreaming && /* @__PURE__ */ jsx("span", { className: "status-indicator status-success", children: "Active" })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "console-controls", children: [
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => copyText(orderLogs.join("\n")), children: "Copy" }),
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => {
                  setOrderLogs([]);
                  setOrderProgress(0);
                }, children: "Clear" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "console-content", children: orderLogs.length > 0 ? orderLogs.map((log, i) => /* @__PURE__ */ jsx("div", { className: "log-entry", style: { color: log.includes("[Error]") ? "var(--rose)" : "var(--text-secondary)" }, children: log }, i)) : /* @__PURE__ */ jsx("span", { style: { color: "var(--text-muted)" }, children: "No stream events yet. Click Subscribe to start." }) })
          ] })
        ] })
      ] }),
      (activeTab === "all" || activeTab === "cs") && /* @__PURE__ */ jsxs("div", { className: "card", id: "card-cs", children: [
        /* @__PURE__ */ jsx("div", { className: "card-top", children: /* @__PURE__ */ jsxs("div", { className: "card-title-group", children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Client Streaming",
            /* @__PURE__ */ jsx("span", { className: "pattern-badge badge-cs", children: "RecordMetrics" })
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Client streams sequential telemetry items; server aggregates into a single summary." })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "card-content", children: [
          /* @__PURE__ */ jsxs("div", { className: "contract-bar", children: [
            /* @__PURE__ */ jsxs("div", { className: "endpoint-display", children: [
              /* @__PURE__ */ jsx("span", { className: "method-tag tag-post", children: "POST" }),
              /* @__PURE__ */ jsx("span", { children: "/api/grpc/metrics" })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "proto-sig", children: "rpc RecordMetrics(stream RecordMetricsRequest) returns (RecordMetricsResponse)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "presets-row", children: [
            /* @__PURE__ */ jsx("span", { className: "presets-label", children: "Payload:" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "preset-chip",
                onClick: () => setMetricsBody(JSON.stringify({
                  pings: [
                    { metric_name: "cpu_usage", value: 72.5, unit: "%" },
                    { metric_name: "memory_mb", value: 1024, unit: "MB" },
                    { metric_name: "response_ms", value: 143, unit: "ms" }
                  ]
                }, null, 2)),
                children: "Standard (3 items)"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "preset-chip",
                onClick: () => setMetricsBody(JSON.stringify({
                  pings: [
                    { metric_name: "cpu_usage", value: 98.2, unit: "%" },
                    { metric_name: "memory_mb", value: 3850, unit: "MB" },
                    { metric_name: "response_ms", value: 890, unit: "ms" },
                    { metric_name: "error_rate", value: 5.4, unit: "%" },
                    { metric_name: "requests_sec", value: 9400, unit: "req/s" }
                  ]
                }, null, 2)),
                children: "High Load (5 items)"
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "code-editor",
              rows: 5,
              value: metricsBody,
              onChange: (e) => setMetricsBody(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx("button", { className: "btn-primary", onClick: handleCallClientStream, disabled: csLoading, children: csLoading ? "Streaming..." : "Stream Metrics" }) }),
          /* @__PURE__ */ jsxs("div", { className: "console-box", children: [
            /* @__PURE__ */ jsxs("div", { className: "console-topbar", children: [
              /* @__PURE__ */ jsxs("div", { className: "console-label", children: [
                /* @__PURE__ */ jsx("span", { children: "Aggregation Summary" }),
                csOutput && /* @__PURE__ */ jsx("span", { className: `status-indicator ${csOutput.statusCode === 200 ? "status-success" : "status-error"}`, children: csOutput.status })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "console-controls", children: [
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => copyText(JSON.stringify(csOutput?.data ?? csOutput?.error, null, 2)), children: "Copy" }),
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => setCsOutput(null), children: "Clear" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "console-content", children: csOutput ? /* @__PURE__ */ jsx("pre", { style: { color: csOutput.statusCode === 200 ? "var(--amber)" : "var(--rose)" }, children: JSON.stringify(csOutput.data ?? { error: csOutput.error }, null, 2) }) : /* @__PURE__ */ jsx("span", { style: { color: "var(--text-muted)" }, children: "No summary yet. Click Stream Metrics to run." }) })
          ] })
        ] })
      ] }),
      (activeTab === "all" || activeTab === "bidi") && /* @__PURE__ */ jsxs("div", { className: "card", id: "card-bidi", children: [
        /* @__PURE__ */ jsx("div", { className: "card-top", children: /* @__PURE__ */ jsxs("div", { className: "card-title-group", children: [
          /* @__PURE__ */ jsxs("h2", { children: [
            "Bidirectional Streaming",
            /* @__PURE__ */ jsx("span", { className: "pattern-badge badge-bidi", children: "LiveSupport" })
          ] }),
          /* @__PURE__ */ jsx("p", { children: "Full-duplex stream where client and server exchange messages independently." })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "card-content", children: [
          /* @__PURE__ */ jsxs("div", { className: "contract-bar", children: [
            /* @__PURE__ */ jsxs("div", { className: "endpoint-display", children: [
              /* @__PURE__ */ jsx("span", { className: "method-tag tag-post", children: "POST" }),
              /* @__PURE__ */ jsx("span", { children: "/api/grpc/support/chat" })
            ] }),
            /* @__PURE__ */ jsx("span", { className: "proto-sig", children: "rpc LiveSupport(stream LiveSupportRequest) returns (stream LiveSupportResponse)" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "presets-row", children: [
            /* @__PURE__ */ jsx("span", { className: "presets-label", children: "Dialogue:" }),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "preset-chip",
                onClick: () => setBidiBody(JSON.stringify({
                  sender: "Alice",
                  messages: ["hello", "order", "ORD-001", "thanks", "bye"]
                }, null, 2)),
                children: "Order Inquiry"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                className: "preset-chip",
                onClick: () => setBidiBody(JSON.stringify({
                  sender: "Bob",
                  messages: ["hi", "refund", "yes", "thanks"]
                }, null, 2)),
                children: "Refund Support"
              }
            )
          ] }),
          /* @__PURE__ */ jsx(
            "textarea",
            {
              className: "code-editor",
              rows: 4,
              value: bidiBody,
              onChange: (e) => setBidiBody(e.target.value)
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx("button", { className: "btn-primary", onClick: handleCallBidiStream, disabled: bidiLoading, children: bidiLoading ? "Sending..." : "Send Messages" }) }),
          /* @__PURE__ */ jsxs("div", { className: "console-box", children: [
            /* @__PURE__ */ jsxs("div", { className: "console-topbar", children: [
              /* @__PURE__ */ jsxs("div", { className: "console-label", children: [
                /* @__PURE__ */ jsx("span", { children: "Chat Log" }),
                bidiChat.length > 0 && /* @__PURE__ */ jsxs("span", { className: "status-indicator status-success", children: [
                  bidiChat.length,
                  " events"
                ] })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "console-controls", children: [
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => copyText(JSON.stringify(bidiChat, null, 2)), children: "Copy" }),
                /* @__PURE__ */ jsx("button", { className: "btn-ghost", onClick: () => setBidiChat([]), children: "Clear" })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { className: "console-content", children: bidiChat.length > 0 ? bidiChat.map((msg, i) => /* @__PURE__ */ jsxs("div", { className: `chat-row ${msg.is_bot ? "chat-bot" : "chat-user"}`, children: [
              /* @__PURE__ */ jsxs("div", { className: "chat-meta", children: [
                msg.is_bot ? "SupportBot" : msg.sender,
                " \xB7 ",
                msg.timestamp ? msg.timestamp.slice(11, 19) : ""
              ] }),
              /* @__PURE__ */ jsx("div", { className: "chat-body", children: msg.text })
            ] }, i)) : /* @__PURE__ */ jsx("span", { style: { color: "var(--text-muted)" }, children: "No messages yet. Click Send Messages to start session." }) })
          ] })
        ] })
      ] })
    ] }),
    toastMsg && /* @__PURE__ */ jsx("div", { className: "toast-bar", children: toastMsg }),
    /* @__PURE__ */ jsxs("footer", { className: "footer", children: [
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("span", { children: "gRPC Example \xB7 Express Gateway & React SSR" }) }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx("a", { href: "/static", children: "View Static Schema Reference" }) })
    ] })
  ] });
}

// src/ssr/render.ts
function renderExplorerPage(options = {}) {
  return renderSSR({
    App,
    title: options.title ?? "Scaflo gRPC Example",
    cssPath: options.cssPath ?? "/styles.css",
    jsPath: options.jsPath ?? "/client.js"
  });
}

// src/gateway/routes/web.ts
var webRouter = Router();
webRouter.get("/", (_req, res) => {
  const html = renderExplorerPage();
  res.send(html);
});
webRouter.get("/static", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public/index.html"));
});
function createStub(address = "localhost:50051") {
  return new proto.ecommerce.InventoryService(
    address,
    grpc2.credentials.createInsecure()
  );
}
var _stub = null;
function getStub() {
  if (!_stub) _stub = createStub();
  return _stub;
}
function getProduct2(productId) {
  return new Promise((resolve, reject) => {
    getStub().GetProduct({ product_id: productId }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}
function trackOrder2(orderId, onData, onEnd, onError) {
  const stream = getStub().TrackOrder({ order_id: orderId });
  stream.on("data", onData);
  stream.on("end", onEnd);
  stream.on("error", onError);
  return stream;
}
function recordMetrics2(pings) {
  return new Promise((resolve, reject) => {
    const stream = getStub().RecordMetrics((err, summary) => {
      if (err) reject(err);
      else resolve(summary);
    });
    for (const ping of pings) {
      stream.write(ping);
    }
    stream.end();
  });
}
function openLiveSupport() {
  return getStub().LiveSupport();
}

// src/gateway/routes/api.ts
var apiRouter = Router();
apiRouter.get("/product/:id", async (req, res) => {
  const id = req.params.id?.trim();
  if (!id) {
    res.status(400).json({
      pattern: "Unary RPC",
      error: "Product ID parameter is required.",
      hint: "Provide an ID such as P001, P002, P003, P004, P005."
    });
    return;
  }
  try {
    const product = await getProduct2(id);
    res.json({
      pattern: "Unary RPC",
      description: "Single request \u2192 Single response",
      data: product
    });
  } catch (err) {
    const error = err;
    const statusCode = error.code === 5 ? 404 : 500;
    res.status(statusCode).json({
      pattern: "Unary RPC",
      error: error.message ?? "Product not found",
      hint: "Available: P001, P002, P003, P004, P005"
    });
  }
});
apiRouter.get("/track/:orderId", (req, res) => {
  const orderId = req.params.orderId?.trim();
  if (!orderId) {
    res.status(400).json({ error: "Order ID parameter is required." });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  let isClosed = false;
  const stream = trackOrder2(
    orderId,
    (update) => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ pattern: "Server Streaming RPC", ...update })}

`);
      }
    },
    () => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ done: true })}

`);
        res.end();
      }
    },
    (err) => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ error: err.message })}

`);
        res.end();
      }
    }
  );
  req.on("close", () => {
    isClosed = true;
    stream.cancel();
  });
});
apiRouter.post("/metrics", async (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.pings) || body.pings.length === 0) {
    res.status(400).json({
      error: "Invalid payload: 'pings' must be a non-empty array of metric objects.",
      example: {
        pings: [
          { metric_name: "cpu_usage", value: 72.5, unit: "%" },
          { metric_name: "memory_mb", value: 1024, unit: "MB" },
          { metric_name: "response_ms", value: 143, unit: "ms" }
        ]
      }
    });
    return;
  }
  for (let i = 0; i < body.pings.length; i++) {
    const ping = body.pings[i];
    if (!ping || typeof ping !== "object" || typeof ping.value !== "number" || isNaN(ping.value)) {
      res.status(400).json({
        error: `Invalid ping at index ${i}: 'value' must be a valid number.`
      });
      return;
    }
  }
  const pings = body.pings.map((p) => ({
    metric_name: p.metric_name?.trim() || "unnamed_metric",
    value: Number(p.value),
    unit: p.unit?.trim() || "",
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  }));
  try {
    const summary = await recordMetrics2(pings);
    res.json({
      pattern: "Client Streaming RPC",
      description: `Streamed ${pings.length} metrics \u2192 Got aggregated summary`,
      data: summary
    });
  } catch (err) {
    const error = err;
    res.status(500).json({ error: error.message ?? "Failed to process metrics stream." });
  }
});
apiRouter.post("/support/chat", (req, res) => {
  const body = req.body;
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: "Invalid payload: 'messages' must be a non-empty array of strings.",
      example: {
        sender: "Alice",
        messages: ["hello", "order", "ORD-001"]
      }
    });
    return;
  }
  const messages = body.messages.map((m) => typeof m === "string" ? m.trim() : "").filter((m) => m.length > 0);
  if (messages.length === 0) {
    res.status(400).json({ error: "Payload must contain at least one non-empty string in 'messages'." });
    return;
  }
  const sender = typeof body.sender === "string" && body.sender.trim() ? body.sender.trim() : "User";
  const stream = openLiveSupport();
  const conversation = [];
  let msgIndex = 0;
  let isFinished = false;
  let clientEnded = false;
  const timeoutId = setTimeout(() => {
    if (!isFinished) {
      isFinished = true;
      stream.cancel();
      if (!res.headersSent) {
        res.status(504).json({ error: "Bidirectional stream timed out after 10s." });
      }
    }
  }, 1e4);
  res.on("close", () => {
    if (!res.writableEnded && !isFinished) {
      isFinished = true;
      clearTimeout(timeoutId);
      stream.cancel();
    }
  });
  stream.on("data", (reply) => {
    if (isFinished) return;
    conversation.push(reply);
    if (msgIndex < messages.length) {
      const text = messages[msgIndex];
      if (text) {
        setTimeout(() => {
          if (isFinished) return;
          const timestamp = (/* @__PURE__ */ new Date()).toISOString();
          conversation.push({ sender, text, timestamp, is_bot: false });
          stream.write({ sender, text, timestamp, is_bot: false });
          msgIndex++;
        }, 100);
      }
    } else if (!clientEnded) {
      clientEnded = true;
      stream.end();
    }
  });
  stream.on("end", () => {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.json({
        pattern: "Bidirectional Streaming RPC",
        description: "Both client & server send streams independently (full-duplex)",
        data: conversation
      });
    }
  });
  stream.on("error", (err) => {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });
  const firstMsg = messages[msgIndex];
  if (firstMsg) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    conversation.push({ sender, text: firstMsg, timestamp, is_bot: false });
    stream.write({ sender, text: firstMsg, timestamp, is_bot: false });
    msgIndex++;
  }
});

// src/gateway/app.ts
function createGatewayApp() {
  const app = express();
  app.use(express.json());
  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir, { index: false }));
  app.use("/", webRouter);
  app.use("/api/grpc", apiRouter);
  return app;
}

// src/server.ts
var PORT = 3e3;
var GRPC_PORT = 50051;
startGrpcServer(GRPC_PORT).then(() => {
  const app = createGatewayApp();
  app.listen(PORT, () => {
    console.log(`[gateway] listening on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to start gRPC server:", err);
  process.exit(1);
});
