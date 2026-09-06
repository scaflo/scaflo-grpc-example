import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import fs from 'fs';

// src/server.ts

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
  { status: 6, label: "DELIVERED", message: "Package delivered successfully. Enjoy! \u{1F389}", progressPct: 100, delayMs: 500 }
];
var BOT_REPLIES = {
  hello: "Hi there! \u{1F44B} How can I help you today?",
  hi: "Hello! Welcome to support. What do you need help with?",
  order: "To track your order, please share your order ID (e.g. ORD-001).",
  "ORD-001": "Order ORD-001: Currently shipped, expected delivery tomorrow by 6 PM.",
  "ORD-002": "Order ORD-002: Delivered on time to Bob. Let us know if you need a return.",
  "ORD-003": "Order ORD-003: Still processing. 3 units of Headphones are being packed.",
  refund: "For refunds, please allow 3\u20135 business days once initiated. Shall I process it?",
  yes: "Done! Initiating your refund now. You'll get a confirmation shortly. \u2705",
  no: "Alright, no action taken. Is there anything else I can help you with?",
  thanks: "You're most welcome! Have a great day. \u{1F60A}",
  bye: "Goodbye! Don't hesitate to chat again anytime. \u{1F44B}"
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

// src/grpc/handlers.ts
function getProduct(call, callback) {
  const { product_id } = call.request;
  console.log(`
[Unary] GetProduct called \u2192 product_id: "${product_id}"`);
  const product = findProduct(product_id);
  if (!product) {
    callback({
      code: 5,
      // grpc.status.NOT_FOUND
      message: `Product "${product_id}" not found. Available: P001\u2013P005`
    });
    return;
  }
  console.log(`[Unary] Responding with product: ${product.name}`);
  callback(null, product);
}
function trackOrder(call) {
  const { order_id } = call.request;
  console.log(`
[Server Stream] TrackOrder called \u2192 order_id: "${order_id}"`);
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
      console.log(`[Server Stream] All stages sent for ${order_id}. Ending stream.`);
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
    console.log(`[Server Stream] Writing stage ${stageIndex + 1}/${ORDER_STAGES.length}: ${stage.label}`);
    call.write(update);
    stageIndex++;
    setTimeout(sendNextStage, stage.delayMs);
  };
  sendNextStage();
}
function recordMetrics(call, callback) {
  console.log("\n[Client Stream] RecordMetrics stream started.");
  const pings = [];
  call.on("data", (ping) => {
    console.log(`[Client Stream] Received ping \u2192 ${ping.metric_name}: ${ping.value} ${ping.unit}`);
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
    console.log(`[Client Stream] Stream ended. Sending summary: ${pings.length} pings, avg=${summary.average_value.toFixed(2)}`);
    callback(null, summary);
  });
  call.on("error", (err) => {
    console.error("[Client Stream] Stream error:", err.message);
  });
}
function liveSupport(call) {
  console.log("\n[Bidi Stream] LiveSupport session opened.");
  call.on("data", (msg) => {
    console.log(`[Bidi Stream] Client "${msg.sender}" says: "${msg.text}"`);
    const replyText = getBotReply(msg.text);
    const reply = {
      sender: "SupportBot",
      text: replyText,
      timestamp: now(),
      is_bot: true
    };
    console.log(`[Bidi Stream] Bot replies: "${replyText}"`);
    call.write(reply);
  });
  call.on("end", () => {
    console.log("[Bidi Stream] Client closed their stream. Ending server side.");
    call.write({
      sender: "SupportBot",
      text: "Thanks for contacting support. Have a great day! Session closed. \u{1F44B}",
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
var relativeProto = path.resolve(__dirname$1, "../../proto/ecommerce.proto");
var PROTO_PATH = fs.existsSync(relativeProto) ? relativeProto : path.resolve(process.cwd(), "proto/ecommerce.proto");
var packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
var proto = grpc.loadPackageDefinition(packageDefinition);
function createGrpcServer() {
  const server = new grpc.Server();
  const handlers = {
    GetProduct: getProduct,
    // Unary
    TrackOrder: trackOrder,
    // Server Streaming
    RecordMetrics: recordMetrics,
    // Client Streaming
    LiveSupport: liveSupport
    // Bidirectional Streaming
  };
  server.addService(proto.ecommerce.InventoryService.service, handlers);
  return server;
}
function startGrpcServer(port = 50051) {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer();
    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      // no TLS — use createSsl() in prod
      (err, boundPort) => {
        if (err) {
          reject(err);
          return;
        }
        console.log(`
\u{1F680} gRPC Server running on port ${boundPort}`);
        console.log("   \u251C\u2500\u2500 [Unary]         GetProduct");
        console.log("   \u251C\u2500\u2500 [Server Stream] TrackOrder");
        console.log("   \u251C\u2500\u2500 [Client Stream] RecordMetrics");
        console.log("   \u2514\u2500\u2500 [Bidi Stream]   LiveSupport\n");
        resolve(server);
      }
    );
  });
}
var __filename2 = fileURLToPath(import.meta.url);
var __dirname2 = path.dirname(__filename2);
var relativeProto2 = path.resolve(__dirname2, "../../proto/ecommerce.proto");
var PROTO_PATH2 = fs.existsSync(relativeProto2) ? relativeProto2 : path.resolve(process.cwd(), "proto/ecommerce.proto");
var packageDefinition2 = protoLoader.loadSync(PROTO_PATH2, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
var proto2 = grpc.loadPackageDefinition(packageDefinition2);
function createStub(address = "localhost:50051") {
  return new proto2.ecommerce.InventoryService(
    address,
    grpc.credentials.createInsecure()
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

// src/server.ts
var __filename3 = fileURLToPath(import.meta.url);
var __dirname3 = path.dirname(__filename3);
var app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname3, "../public")));
app.get("/api/grpc/product/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`
[HTTP] GET /api/grpc/product/${id} \u2192 Calling Unary RPC`);
  try {
    const product = await getProduct2(id);
    res.json({
      pattern: "Unary RPC",
      description: "Single request \u2192 Single response",
      data: product
    });
  } catch (err) {
    const error = err;
    res.status(404).json({
      pattern: "Unary RPC",
      error: error.message ?? "Product not found",
      hint: "Try: P001, P002, P003, P004, P005"
    });
  }
});
app.get("/api/grpc/track/:orderId", (req, res) => {
  const { orderId } = req.params;
  console.log(`
[HTTP] GET /api/grpc/track/${orderId} \u2192 Calling Server Streaming RPC`);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  trackOrder2(
    orderId,
    (update) => {
      res.write(`data: ${JSON.stringify({ pattern: "Server Streaming RPC", ...update })}

`);
    },
    () => {
      res.write(`data: ${JSON.stringify({ done: true })}

`);
      res.end();
    },
    (err) => {
      res.write(`data: ${JSON.stringify({ error: err.message })}

`);
      res.end();
    }
  );
});
app.post("/api/grpc/metrics", async (req, res) => {
  const body = req.body;
  console.log(`
[HTTP] POST /api/grpc/metrics \u2192 Calling Client Streaming RPC`);
  if (!body.pings || body.pings.length === 0) {
    res.status(400).json({
      error: "Send a body: { pings: [{ metric_name, value, unit }] }",
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
  const pings = body.pings.map((p) => ({
    metric_name: p.metric_name ?? "unknown",
    value: p.value ?? 0,
    unit: p.unit ?? "",
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
    res.status(500).json({ error: error.message });
  }
});
app.post("/api/grpc/support/chat", (req, res) => {
  const body = req.body;
  const messages = body.messages ?? ["hello"];
  const sender = body.sender ?? "User";
  console.log(`
[HTTP] POST /api/grpc/support/chat \u2192 Calling Bidirectional Streaming RPC`);
  console.log(`[HTTP] Sending ${messages.length} message(s) from "${sender}"`);
  const stream = openLiveSupport();
  const conversation = [];
  let msgIndex = 0;
  stream.on("data", (reply) => {
    conversation.push(reply);
    if (msgIndex < messages.length) {
      const text = messages[msgIndex];
      if (text) {
        setTimeout(() => {
          conversation.push({ sender, text, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false });
          stream.write({ sender, text, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false });
          msgIndex++;
        }, 200);
      }
    } else {
      stream.end();
    }
  });
  stream.on("end", () => {
    res.json({
      pattern: "Bidirectional Streaming RPC",
      description: "Both client & server send streams independently (full-duplex)",
      data: conversation
    });
  });
  stream.on("error", (err) => {
    res.status(500).json({ error: err.message });
  });
  const firstMsg = messages[msgIndex];
  if (firstMsg) {
    conversation.push({ sender, text: firstMsg, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false });
    stream.write({ sender, text: firstMsg, timestamp: (/* @__PURE__ */ new Date()).toISOString(), is_bot: false });
    msgIndex++;
  }
});
var PORT = 3e3;
var GRPC_PORT = 50051;
startGrpcServer(GRPC_PORT).then(() => {
  app.listen(PORT, () => {
    console.log(`\u{1F310} Express API Gateway running on http://localhost:${PORT}`);
    console.log(`
\u{1F4CB} Available endpoints:`);
    console.log(`   GET  http://localhost:${PORT}/api/grpc/product/P001    (Unary)`);
    console.log(`   GET  http://localhost:${PORT}/api/grpc/track/ORD-001   (Server Stream via SSE)`);
    console.log(`   POST http://localhost:${PORT}/api/grpc/metrics          (Client Stream)`);
    console.log(`   POST http://localhost:${PORT}/api/grpc/support/chat     (Bidi Stream)`);
    console.log(`
   Open http://localhost:${PORT} for the interactive demo UI
`);
  });
}).catch((err) => {
  console.error("Failed to start gRPC server:", err);
  process.exit(1);
});
