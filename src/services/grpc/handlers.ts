import type * as grpc from "@grpc/grpc-js";
import {
  findProduct,
  findOrder,
  ORDER_STAGES,
  getBotReply,
  now,
} from "../../data/mockData.js";
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

/**
 * Pattern 1: Unary RPC (GetProduct)
 * Single request, single response.
 */
export function getProduct(
  call: grpc.ServerUnaryCall<GetProductRequest, GetProductResponse>,
  callback: grpc.sendUnaryData<GetProductResponse>
): void {
  const { product_id } = call.request;
  const product = findProduct(product_id);

  if (!product) {
    callback({
      code: 5, // grpc.status.NOT_FOUND
      message: `Product "${product_id}" not found. Available: P001–P005`,
    });
    return;
  }

  callback(null, product);
}

/**
 * Pattern 2: Server Streaming RPC (TrackOrder)
 * Single request, multiple responses streamed over time.
 */
export function trackOrder(
  call: grpc.ServerWritableStream<TrackOrderRequest, TrackOrderResponse>
): void {
  const { order_id } = call.request;
  const order = findOrder(order_id);

  if (!order) {
    call.emit("error", {
      code: 5, // NOT_FOUND
      message: `Order "${order_id}" not found. Try ORD-001, ORD-002, ORD-003`,
    });
    return;
  }

  let stageIndex = 0;
  const sendNextStage = (): void => {
    if (stageIndex >= ORDER_STAGES.length) {
      call.end();
      return;
    }

    const stage = ORDER_STAGES[stageIndex];
    if (!stage) {
      call.end();
      return;
    }

    const update: TrackOrderResponse = {
      order_id,
      status: stage.status,
      message: stage.message,
      timestamp: now(),
      progress: stage.progressPct,
    };

    call.write(update);
    stageIndex++;
    setTimeout(sendNextStage, stage.delayMs);
  };

  sendNextStage();
}

/**
 * Pattern 3: Client Streaming RPC (RecordMetrics)
 * Client streams multiple requests, server aggregates and returns one response.
 */
export function recordMetrics(
  call: grpc.ServerReadableStream<RecordMetricsRequest, RecordMetricsResponse>,
  callback: grpc.sendUnaryData<RecordMetricsResponse>
): void {
  const pings: number[] = [];

  call.on("data", (ping: RecordMetricsRequest) => {
    pings.push(ping.value);
  });

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

    callback(null, summary);
  });

  call.on("error", (err: Error) => {
    console.error("[Client Stream] Stream error:", err.message);
  });
}

/**
 * Pattern 4: Bidirectional Streaming RPC (LiveSupport)
 * Both client and server stream messages independently.
 */
export function liveSupport(
  call: grpc.ServerDuplexStream<LiveSupportRequest, LiveSupportResponse>
): void {
  call.on("data", (msg: LiveSupportRequest) => {
    const replyText = getBotReply(msg.text);

    const reply: LiveSupportResponse = {
      sender: "SupportBot",
      text: replyText,
      timestamp: now(),
      is_bot: true,
    };

    call.write(reply);
  });

  call.on("end", () => {
    call.write({
      sender: "SupportBot",
      text: "Thanks for contacting support. Have a great day! Session closed.",
      timestamp: now(),
      is_bot: true,
    });
    call.end();
  });

  call.on("error", (err: Error) => {
    console.error("[Bidi Stream] Error:", err.message);
  });
}
