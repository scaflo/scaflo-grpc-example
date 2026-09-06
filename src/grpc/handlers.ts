// ═══════════════════════════════════════════════════════
//  gRPC SERVICE HANDLERS — All 4 Communication Patterns
//
//  Pattern 1: Unary          → getProduct
//  Pattern 2: Server Stream  → trackOrder
//  Pattern 3: Client Stream  → recordMetrics
//  Pattern 4: Bidi Stream    → liveSupport
// ═══════════════════════════════════════════════════════

import type * as grpc from "@grpc/grpc-js";
import {
  findProduct,
  findOrder,
  ORDER_STAGES,
  getBotReply,
  now,
} from "../data/mockData.js";
import type {
  GetProductRequest,
  GetProductResponse,
  TrackOrderRequest,
  TrackOrderResponse,
  RecordMetricsRequest,
  RecordMetricsResponse,
  LiveSupportRequest,
  LiveSupportResponse,
} from "./types.js";

// ─────────────────────────────────────────────
//  Pattern 1: UNARY RPC — GetProduct
//
//  How it works:
//  - Client sends a single ProductRequest with a product_id
//  - Server looks it up in mock data and calls callback(error, response)
//  - If not found, returns gRPC NOT_FOUND status
//
//  Signature: (call, callback) => void
// ─────────────────────────────────────────────
export function getProduct(
  call: grpc.ServerUnaryCall<GetProductRequest, GetProductResponse>,
  callback: grpc.sendUnaryData<GetProductResponse>
): void {
  const { product_id } = call.request;
  console.log(`\n[Unary] GetProduct called → product_id: "${product_id}"`);

  const product = findProduct(product_id);

  if (!product) {
    // gRPC error status codes are different from HTTP — here we use NOT_FOUND (5)
    callback({
      code: 5, // grpc.status.NOT_FOUND
      message: `Product "${product_id}" not found. Available: P001–P005`,
    });
    return;
  }

  console.log(`[Unary] Responding with product: ${product.name}`);
  callback(null, product);
}

// ─────────────────────────────────────────────
//  Pattern 2: SERVER STREAMING RPC — TrackOrder
//
//  How it works:
//  - Client sends one request with an order_id
//  - Server calls call.write(chunk) multiple times (simulating async stages)
//  - Server calls call.end() when all stages are sent
//  - Client receives each update in real-time as a stream
//
//  Signature: (call) => void   (no callback — streaming is the response)
// ─────────────────────────────────────────────
export function trackOrder(
  call: grpc.ServerWritableStream<TrackOrderRequest, TrackOrderResponse>
): void {
  const { order_id } = call.request;
  console.log(`\n[Server Stream] TrackOrder called → order_id: "${order_id}"`);

  const order = findOrder(order_id);
  if (!order) {
    call.emit("error", {
      code: 5, // NOT_FOUND
      message: `Order "${order_id}" not found. Try ORD-001, ORD-002, ORD-003`,
    });
    return;
  }

  // Stream each status stage with a delay to simulate real-world async updates
  let stageIndex = 0;
  const sendNextStage = (): void => {
    if (stageIndex >= ORDER_STAGES.length) {
      console.log(`[Server Stream] All stages sent for ${order_id}. Ending stream.`);
      call.end(); // Signal stream completion to client
      return;
    }

    const stage = ORDER_STAGES[stageIndex];
    if (!stage) { call.end(); return; }

    const update: TrackOrderResponse = {
      order_id,
      status: stage.status,
      message: stage.message,
      timestamp: now(),
      progress: stage.progressPct,
    };

    console.log(`[Server Stream] Writing stage ${stageIndex + 1}/${ORDER_STAGES.length}: ${stage.label}`);
    call.write(update); // Push one update to the client stream

    stageIndex++;
    setTimeout(sendNextStage, stage.delayMs); // Wait before next stage
  };

  sendNextStage();
}

// ─────────────────────────────────────────────
//  Pattern 3: CLIENT STREAMING RPC — RecordMetrics
//
//  How it works:
//  - Client streams multiple MetricPing messages one by one
//  - Server accumulates all pings using call.on("data", ...)
//  - When client signals done (call.on("end", ...)), server calls
//    callback(null, summary) with the aggregated result
//
//  Signature: (call, callback) => void
// ─────────────────────────────────────────────
export function recordMetrics(
  call: grpc.ServerReadableStream<RecordMetricsRequest, RecordMetricsResponse>,
  callback: grpc.sendUnaryData<RecordMetricsResponse>
): void {
  console.log("\n[Client Stream] RecordMetrics stream started.");

  const pings: number[] = [];

  // Accumulate each incoming message from the client stream
  call.on("data", (ping: RecordMetricsRequest) => {
    console.log(`[Client Stream] Received ping → ${ping.metric_name}: ${ping.value} ${ping.unit}`);
    pings.push(ping.value);
  });

  // When client ends the stream, compute and return the summary
  call.on("end", () => {
    if (pings.length === 0) {
      callback({ code: 3, message: "No metrics received in stream." });
      return;
    }

    const total = pings.reduce((a, b) => a + b, 0);
    const summary: RecordMetricsResponse = {
      total_pings: pings.length,
      average_value: total / pings.length,
      min_value: Math.min(...pings),
      max_value: Math.max(...pings),
      total_value: total,
      processed_at: now(),
    };

    console.log(`[Client Stream] Stream ended. Sending summary: ${pings.length} pings, avg=${summary.average_value.toFixed(2)}`);
    callback(null, summary); // Single response sent back after stream closes
  });

  call.on("error", (err: Error) => {
    console.error("[Client Stream] Stream error:", err.message);
  });
}

// ─────────────────────────────────────────────
//  Pattern 4: BIDIRECTIONAL STREAMING — LiveSupport
//
//  How it works:
//  - Client and server BOTH send messages independently over the SAME stream
//  - Client sends ChatMessages, server reads them and replies immediately
//  - Neither side has to wait for the other to finish
//  - call.on("data") to read incoming, call.write() to send outgoing
//  - call.on("end") to know when client finished, then call.end() server-side
//
//  Signature: (call) => void
// ─────────────────────────────────────────────
export function liveSupport(
  call: grpc.ServerDuplexStream<LiveSupportRequest, LiveSupportResponse>
): void {
  console.log("\n[Bidi Stream] LiveSupport session opened.");

  // Listen for messages from client
  call.on("data", (msg: LiveSupportRequest) => {
    console.log(`[Bidi Stream] Client "${msg.sender}" says: "${msg.text}"`);

    // Bot generates a reply based on keywords
    const replyText = getBotReply(msg.text);

    const reply: LiveSupportResponse = {
      sender: "SupportBot",
      text: replyText,
      timestamp: now(),
      is_bot: true,
    };

    console.log(`[Bidi Stream] Bot replies: "${replyText}"`);
    call.write(reply); // Server sends its own message back — independent of client stream
  });

  // When the client ends their side of the stream
  call.on("end", () => {
    console.log("[Bidi Stream] Client closed their stream. Ending server side.");
    call.write({
      sender: "SupportBot",
      text: "Thanks for contacting support. Have a great day! Session closed.",
      timestamp: now(),
      is_bot: true,
    });
    call.end(); // Close server's outgoing stream too
  });

  call.on("error", (err: Error) => {
    console.error("[Bidi Stream] Error:", err.message);
  });
}
