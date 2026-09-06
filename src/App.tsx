import React, { useState, useEffect, useRef } from "react";

interface ChatMsg {
  sender: string;
  text: string;
  timestamp: string;
  is_bot: boolean;
}

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<"all" | "unary" | "ss" | "cs" | "bidi">("all");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Pattern 1: Unary state
  const [productId, setProductId] = useState("P001");
  const [unaryOutput, setUnaryOutput] = useState<{ status: string; statusCode: number; data?: unknown; error?: string; latency?: string } | null>(null);
  const [unaryLoading, setUnaryLoading] = useState(false);

  // Pattern 2: Server Streaming state
  const [orderId, setOrderId] = useState("ORD-001");
  const [orderProgress, setOrderProgress] = useState(0);
  const [orderLogs, setOrderLogs] = useState<string[]>([]);
  const [ssStreaming, setSsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Pattern 3: Client Streaming state
  const [metricsBody, setMetricsBody] = useState(JSON.stringify({
    pings: [
      { metric_name: "cpu_usage", value: 72.5, unit: "%" },
      { metric_name: "memory_mb", value: 1024, unit: "MB" },
      { metric_name: "response_ms", value: 143, unit: "ms" }
    ]
  }, null, 2));
  const [csOutput, setCsOutput] = useState<{ status: string; statusCode: number; data?: unknown; error?: string } | null>(null);
  const [csLoading, setCsLoading] = useState(false);

  // Pattern 4: Bidi Streaming state
  const [bidiBody, setBidiBody] = useState(JSON.stringify({
    sender: "Alice",
    messages: ["hello", "order", "ORD-001", "thanks", "bye"]
  }, null, 2));
  const [bidiChat, setBidiChat] = useState<ChatMsg[]>([]);
  const [bidiLoading, setBidiLoading] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2500);
  };

  const copyText = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard"));
    }
  };

  // ── Call Pattern 1: Unary ──
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
    } catch (err: unknown) {
      const e = err as Error;
      setUnaryOutput({ status: "Network Error", statusCode: 500, error: e.message });
    } finally {
      setUnaryLoading(false);
    }
  };

  // ── Call Pattern 2: Server Streaming ──
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

  // ── Call Pattern 3: Client Streaming ──
  const handleCallClientStream = async () => {
    let payload;
    try {
      payload = JSON.parse(metricsBody);
    } catch (err: unknown) {
      const e = err as Error;
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
    } catch (err: unknown) {
      const e = err as Error;
      setCsOutput({ status: "Network Error", statusCode: 500, error: e.message });
    } finally {
      setCsLoading(false);
    }
  };

  // ── Call Pattern 4: Bidi Streaming ──
  const handleCallBidiStream = async () => {
    let payload;
    try {
      payload = JSON.parse(bidiBody);
    } catch (err: unknown) {
      const e = err as Error;
      setBidiChat([{ sender: "System", text: `Invalid JSON: ${e.message}`, timestamp: new Date().toISOString(), is_bot: false }]);
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
        setBidiChat([{ sender: "System", text: `Error: ${result.error ?? "Unknown error"}`, timestamp: new Date().toISOString(), is_bot: false }]);
      }
    } catch (err: unknown) {
      const e = err as Error;
      setBidiChat([{ sender: "System", text: `Network Error: ${e.message}`, timestamp: new Date().toISOString(), is_bot: false }]);
    } finally {
      setBidiLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-badge">gRPC</div>
            <div className="brand-title">
              <h1>API Explorer</h1>
              <p><span className="status-dot"></span> Core: 0.0.0.0:50051 · Gateway: :3000</p>
            </div>
          </div>
          <div className="header-meta">
            <div className="meta-pill">Engine: <strong>React SSR</strong></div>
            <a href="/static" target="_blank" className="nav-link-btn">Schema Reference</a>
          </div>
        </div>
      </header>

      {/* ── FILTER TABS ── */}
      <div className="filter-bar">
        <button className={`filter-btn ${activeTab === "all" ? "active" : ""}`} onClick={() => setActiveTab("all")}>All Patterns</button>
        <button className={`filter-btn ${activeTab === "unary" ? "active" : ""}`} onClick={() => setActiveTab("unary")}>Unary RPC</button>
        <button className={`filter-btn ${activeTab === "ss" ? "active" : ""}`} onClick={() => setActiveTab("ss")}>Server Streaming</button>
        <button className={`filter-btn ${activeTab === "cs" ? "active" : ""}`} onClick={() => setActiveTab("cs")}>Client Streaming</button>
        <button className={`filter-btn ${activeTab === "bidi" ? "active" : ""}`} onClick={() => setActiveTab("bidi")}>Bidirectional Streaming</button>
      </div>

      {/* ── GRID CONTENT ── */}
      <div className="grid-container">

        {/* ── PATTERN 1: UNARY ── */}
        {(activeTab === "all" || activeTab === "unary") && (
          <div className="card" id="card-unary">
            <div className="card-top">
              <div className="card-title-group">
                <h2>
                  Unary RPC
                  <span className="pattern-badge badge-unary">GetProduct</span>
                </h2>
                <p>Single request produces a single response over HTTP/2.</p>
              </div>
            </div>
            <div className="card-content">
              <div className="contract-bar">
                <div className="endpoint-display">
                  <span className="method-tag tag-get">GET</span>
                  <span>/api/grpc/product/<strong>{productId}</strong></span>
                </div>
                <span className="proto-sig">rpc GetProduct(GetProductRequest) returns (GetProductResponse)</span>
              </div>

              <div className="presets-row">
                <span className="presets-label">Preset:</span>
                {["P001", "P002", "P003", "P005", "P999"].map((id) => (
                  <button
                    key={id}
                    className={`preset-chip ${productId === id ? "active" : ""}`}
                    onClick={() => setProductId(id)}
                  >
                    {id} {id === "P999" ? "(404)" : ""}
                  </button>
                ))}
              </div>

              <div className="input-row">
                <input
                  type="text"
                  className="field-input"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="Product ID (e.g. P001)"
                />
                <button className="btn-primary" onClick={handleCallUnary} disabled={unaryLoading}>
                  {unaryLoading ? "Calling..." : "Execute"}
                </button>
              </div>

              <div className="console-box">
                <div className="console-topbar">
                  <div className="console-label">
                    <span>Response</span>
                    {unaryOutput && (
                      <span className={`status-indicator ${unaryOutput.statusCode === 200 ? "status-success" : "status-error"}`}>
                        {unaryOutput.status}
                      </span>
                    )}
                    {unaryOutput?.latency && <span className="status-latency">· {unaryOutput.latency}</span>}
                  </div>
                  <div className="console-controls">
                    <button className="btn-ghost" onClick={() => copyText(JSON.stringify(unaryOutput?.data ?? unaryOutput?.error, null, 2))}>Copy</button>
                    <button className="btn-ghost" onClick={() => setUnaryOutput(null)}>Clear</button>
                  </div>
                </div>
                <div className="console-content">
                  {unaryOutput ? (
                    <pre style={{ color: unaryOutput.statusCode === 200 ? "var(--text-primary)" : "var(--rose)" }}>
                      {JSON.stringify(unaryOutput.data ?? { error: unaryOutput.error }, null, 2)}
                    </pre>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>// Dispatch an RPC call to inspect the server response.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PATTERN 2: SERVER STREAMING ── */}
        {(activeTab === "all" || activeTab === "ss") && (
          <div className="card" id="card-ss">
            <div className="card-top">
              <div className="card-title-group">
                <h2>
                  Server Streaming
                  <span className="pattern-badge badge-ss">TrackOrder</span>
                </h2>
                <p>Client initiates request; server pushes multiple lifecycle events via Server-Sent Events.</p>
              </div>
            </div>
            <div className="card-content">
              <div className="contract-bar">
                <div className="endpoint-display">
                  <span className="method-tag tag-get">GET</span>
                  <span>/api/grpc/track/<strong>{orderId}</strong></span>
                </div>
                <span className="proto-sig">rpc TrackOrder(TrackOrderRequest) returns (stream TrackOrderResponse)</span>
              </div>

              <div className="presets-row">
                <span className="presets-label">Orders:</span>
                {["ORD-001", "ORD-002", "ORD-003", "ORD-999"].map((id) => (
                  <button
                    key={id}
                    className={`preset-chip ${orderId === id ? "active" : ""}`}
                    onClick={() => setOrderId(id)}
                  >
                    {id}
                  </button>
                ))}
              </div>

              <div className="input-row">
                <input
                  type="text"
                  className="field-input"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  placeholder="Order ID (e.g. ORD-001)"
                />
                <button className="btn-primary" onClick={handleCallServerStream} disabled={ssStreaming}>
                  {ssStreaming ? "Streaming..." : "Subscribe"}
                </button>
              </div>

              <div className="progress-container">
                <div className="progress-header">
                  <span>Lifecycle Progress</span>
                  <span>{orderProgress}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${orderProgress}%` }}></div>
                </div>
              </div>

              <div className="console-box">
                <div className="console-topbar">
                  <div className="console-label">
                    <span>Stream Events</span>
                    {ssStreaming && <span className="status-indicator status-success">Active</span>}
                  </div>
                  <div className="console-controls">
                    <button className="btn-ghost" onClick={() => copyText(orderLogs.join("\n"))}>Copy</button>
                    <button className="btn-ghost" onClick={() => { setOrderLogs([]); setOrderProgress(0); }}>Clear</button>
                  </div>
                </div>
                <div className="console-content">
                  {orderLogs.length > 0 ? (
                    orderLogs.map((log, i) => (
                      <div key={i} className="log-entry" style={{ color: log.includes("[Error]") ? "var(--rose)" : "var(--text-secondary)" }}>
                        {log}
                      </div>
                    ))
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>// Streamed lifecycle events will be rendered sequentially here.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PATTERN 3: CLIENT STREAMING ── */}
        {(activeTab === "all" || activeTab === "cs") && (
          <div className="card" id="card-cs">
            <div className="card-top">
              <div className="card-title-group">
                <h2>
                  Client Streaming
                  <span className="pattern-badge badge-cs">RecordMetrics</span>
                </h2>
                <p>Client streams sequential telemetry items; server aggregates into a single summary.</p>
              </div>
            </div>
            <div className="card-content">
              <div className="contract-bar">
                <div className="endpoint-display">
                  <span className="method-tag tag-post">POST</span>
                  <span>/api/grpc/metrics</span>
                </div>
                <span className="proto-sig">rpc RecordMetrics(stream RecordMetricsRequest) returns (RecordMetricsResponse)</span>
              </div>

              <div className="presets-row">
                <span className="presets-label">Payload:</span>
                <button
                  className="preset-chip"
                  onClick={() => setMetricsBody(JSON.stringify({
                    pings: [
                      { metric_name: "cpu_usage", value: 72.5, unit: "%" },
                      { metric_name: "memory_mb", value: 1024, unit: "MB" },
                      { metric_name: "response_ms", value: 143, unit: "ms" }
                    ]
                  }, null, 2))}
                >
                  Standard (3 items)
                </button>
                <button
                  className="preset-chip"
                  onClick={() => setMetricsBody(JSON.stringify({
                    pings: [
                      { metric_name: "cpu_usage", value: 98.2, unit: "%" },
                      { metric_name: "memory_mb", value: 3850, unit: "MB" },
                      { metric_name: "response_ms", value: 890, unit: "ms" },
                      { metric_name: "error_rate", value: 5.4, unit: "%" },
                      { metric_name: "requests_sec", value: 9400, unit: "req/s" }
                    ]
                  }, null, 2))}
                >
                  High Load (5 items)
                </button>
              </div>

              <textarea
                className="code-editor"
                rows={5}
                value={metricsBody}
                onChange={(e) => setMetricsBody(e.target.value)}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-primary" onClick={handleCallClientStream} disabled={csLoading}>
                  {csLoading ? "Streaming..." : "Stream Metrics"}
                </button>
              </div>

              <div className="console-box">
                <div className="console-topbar">
                  <div className="console-label">
                    <span>Aggregation Summary</span>
                    {csOutput && (
                      <span className={`status-indicator ${csOutput.statusCode === 200 ? "status-success" : "status-error"}`}>
                        {csOutput.status}
                      </span>
                    )}
                  </div>
                  <div className="console-controls">
                    <button className="btn-ghost" onClick={() => copyText(JSON.stringify(csOutput?.data ?? csOutput?.error, null, 2))}>Copy</button>
                    <button className="btn-ghost" onClick={() => setCsOutput(null)}>Clear</button>
                  </div>
                </div>
                <div className="console-content">
                  {csOutput ? (
                    <pre style={{ color: csOutput.statusCode === 200 ? "var(--amber)" : "var(--rose)" }}>
                      {JSON.stringify(csOutput.data ?? { error: csOutput.error }, null, 2)}
                    </pre>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>// Stream items will be ingested and aggregated by the gRPC server.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── PATTERN 4: BIDI STREAMING ── */}
        {(activeTab === "all" || activeTab === "bidi") && (
          <div className="card" id="card-bidi">
            <div className="card-top">
              <div className="card-title-group">
                <h2>
                  Bidirectional Streaming
                  <span className="pattern-badge badge-bidi">LiveSupport</span>
                </h2>
                <p>Full-duplex stream where client and server exchange messages independently.</p>
              </div>
            </div>
            <div className="card-content">
              <div className="contract-bar">
                <div className="endpoint-display">
                  <span className="method-tag tag-post">POST</span>
                  <span>/api/grpc/support/chat</span>
                </div>
                <span className="proto-sig">rpc LiveSupport(stream LiveSupportRequest) returns (stream LiveSupportResponse)</span>
              </div>

              <div className="presets-row">
                <span className="presets-label">Dialogue:</span>
                <button
                  className="preset-chip"
                  onClick={() => setBidiBody(JSON.stringify({
                    sender: "Alice",
                    messages: ["hello", "order", "ORD-001", "thanks", "bye"]
                  }, null, 2))}
                >
                  Order Inquiry
                </button>
                <button
                  className="preset-chip"
                  onClick={() => setBidiBody(JSON.stringify({
                    sender: "Bob",
                    messages: ["hi", "refund", "yes", "thanks"]
                  }, null, 2))}
                >
                  Refund Support
                </button>
              </div>

              <textarea
                className="code-editor"
                rows={4}
                value={bidiBody}
                onChange={(e) => setBidiBody(e.target.value)}
              />

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn-primary" onClick={handleCallBidiStream} disabled={bidiLoading}>
                  {bidiLoading ? "Conversing..." : "Execute Session"}
                </button>
              </div>

              <div className="console-box">
                <div className="console-topbar">
                  <div className="console-label">
                    <span>Dialogue Audit</span>
                    {bidiChat.length > 0 && <span className="status-indicator status-success">{bidiChat.length} events</span>}
                  </div>
                  <div className="console-controls">
                    <button className="btn-ghost" onClick={() => copyText(JSON.stringify(bidiChat, null, 2))}>Copy</button>
                    <button className="btn-ghost" onClick={() => setBidiChat([])}>Clear</button>
                  </div>
                </div>
                <div className="console-content">
                  {bidiChat.length > 0 ? (
                    bidiChat.map((msg, i) => (
                      <div key={i} className={`chat-row ${msg.is_bot ? "chat-bot" : "chat-user"}`}>
                        <div className="chat-meta">{msg.is_bot ? "SupportBot" : msg.sender} · {msg.timestamp ? msg.timestamp.slice(11, 19) : ""}</div>
                        <div className="chat-body">{msg.text}</div>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>// Full-duplex conversational events will appear here.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {toastMsg && <div className="toast-bar">{toastMsg}</div>}

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div>
          <span>gRPC Architecture Showcase · React SSR Gateway</span>
        </div>
        <div>
          <a href="/static">View Static Schema Reference</a>
        </div>
      </footer>
    </div>
  );
}
