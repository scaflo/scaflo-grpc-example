import { Router } from "express";
import type * as grpc from "@grpc/grpc-js";
import {
  getProduct,
  trackOrder,
  recordMetrics,
  openLiveSupport,
  type MetricPing,
  type ChatMessage,
} from "../../clients/grpc/index.js";

export const apiRouter: Router = Router();

// Pattern 1: Unary RPC
apiRouter.get("/product/:id", async (req, res) => {
  const id = req.params.id?.trim();
  if (!id) {
    res.status(400).json({
      pattern: "Unary RPC",
      error: "Product ID parameter is required.",
      hint: "Provide an ID such as P001, P002, P003, P004, P005.",
    });
    return;
  }

  try {
    const product = await getProduct(id);
    res.json({
      pattern: "Unary RPC",
      description: "Single request → Single response",
      data: product,
    });
  } catch (err: unknown) {
    const error = err as grpc.ServiceError;
    const statusCode = error.code === 5 ? 404 : 500;
    res.status(statusCode).json({
      pattern: "Unary RPC",
      error: error.message ?? "Product not found",
      hint: "Available: P001, P002, P003, P004, P005",
    });
  }
});

// Pattern 2: Server Streaming RPC (via Server-Sent Events)
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
    "Access-Control-Allow-Origin": "*",
  });

  let isClosed = false;
  const stream = trackOrder(
    orderId,
    (update) => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ pattern: "Server Streaming RPC", ...update })}\n\n`);
      }
    },
    () => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    },
    (err) => {
      if (!isClosed) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    }
  );

  req.on("close", () => {
    isClosed = true;
    stream.cancel();
  });
});

// Pattern 3: Client Streaming RPC
apiRouter.post("/metrics", async (req, res) => {
  const body = req.body as { pings?: unknown };

  if (!body || !Array.isArray(body.pings) || body.pings.length === 0) {
    res.status(400).json({
      error: "Invalid payload: 'pings' must be a non-empty array of metric objects.",
      example: {
        pings: [
          { metric_name: "cpu_usage", value: 72.5, unit: "%" },
          { metric_name: "memory_mb", value: 1024, unit: "MB" },
          { metric_name: "response_ms", value: 143, unit: "ms" },
        ],
      },
    });
    return;
  }

  for (let i = 0; i < body.pings.length; i++) {
    const ping = body.pings[i] as Partial<MetricPing> | null | undefined;
    if (!ping || typeof ping !== "object" || typeof ping.value !== "number" || isNaN(ping.value)) {
      res.status(400).json({
        error: `Invalid ping at index ${i}: 'value' must be a valid number.`,
      });
      return;
    }
  }

  const pings: MetricPing[] = (body.pings as Partial<MetricPing>[]).map((p) => ({
    metric_name: p.metric_name?.trim() || "unnamed_metric",
    value: Number(p.value),
    unit: p.unit?.trim() || "",
    timestamp: new Date().toISOString(),
  }));

  try {
    const summary = await recordMetrics(pings);
    res.json({
      pattern: "Client Streaming RPC",
      description: `Streamed ${pings.length} metrics → Got aggregated summary`,
      data: summary,
    });
  } catch (err: unknown) {
    const error = err as { message?: string };
    res.status(500).json({ error: error.message ?? "Failed to process metrics stream." });
  }
});

// Pattern 4: Bidirectional Streaming RPC
apiRouter.post("/support/chat", (req, res) => {
  const body = req.body as { messages?: unknown; sender?: string };

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json({
      error: "Invalid payload: 'messages' must be a non-empty array of strings.",
      example: {
        sender: "Alice",
        messages: ["hello", "order", "ORD-001"],
      },
    });
    return;
  }

  const messages = (body.messages as unknown[])
    .map((m) => (typeof m === "string" ? m.trim() : ""))
    .filter((m) => m.length > 0);

  if (messages.length === 0) {
    res.status(400).json({ error: "Payload must contain at least one non-empty string in 'messages'." });
    return;
  }

  const sender = typeof body.sender === "string" && body.sender.trim() ? body.sender.trim() : "User";

  const stream = openLiveSupport();
  const conversation: ChatMessage[] = [];
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
  }, 10000);

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
          const timestamp = new Date().toISOString();
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
        data: conversation,
      });
    }
  });

  stream.on("error", (err: Error) => {
    if (isFinished) return;
    isFinished = true;
    clearTimeout(timeoutId);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });

  const firstMsg = messages[msgIndex];
  if (firstMsg) {
    const timestamp = new Date().toISOString();
    conversation.push({ sender, text: firstMsg, timestamp, is_bot: false });
    stream.write({ sender, text: firstMsg, timestamp, is_bot: false });
    msgIndex++;
  }
});
