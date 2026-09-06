// ═══════════════════════════════════════════════════════
//  gRPC CLIENT — Consumer side stubs for all 4 patterns
//
//  This is what "consumes" the gRPC service.
//  The client uses generated stubs to call remote procedures
//  as if they were local functions.
// ═══════════════════════════════════════════════════════

import * as grpc from "@grpc/grpc-js";
import { proto } from "./proto.js";
import type {
  InventoryServiceClient,
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
//  Create the client stub
//
//  The stub is the client-side proxy that knows how to serialize
//  requests and deserialize responses using the .proto schema.
//  grpc.credentials.createInsecure() = no TLS (matches server)
// ─────────────────────────────────────────────
function createStub(address: string = "localhost:50051"): InventoryServiceClient {
  return new proto.ecommerce.InventoryService(
    address,
    grpc.credentials.createInsecure()
  );
}

// Singleton stub reused across calls
let _stub: InventoryServiceClient | null = null;
function getStub(): InventoryServiceClient {
  if (!_stub) _stub = createStub();
  return _stub;
}

// ─────────────────────────────────────────────
//  Pattern 1: UNARY — getProduct
//
//  Wraps the callback-based stub call in a Promise.
//  One request → one response.
// ─────────────────────────────────────────────
export type ProductResponse = GetProductResponse;

export function getProduct(productId: string): Promise<GetProductResponse> {
  return new Promise((resolve, reject) => {
    getStub().GetProduct({ product_id: productId }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

// ─────────────────────────────────────────────
//  Pattern 2: SERVER STREAMING — trackOrder
//
//  Returns a readable stream. The caller provides an onData
//  callback that fires for each update, and onEnd for completion.
// ─────────────────────────────────────────────
export type OrderStatusUpdate = TrackOrderResponse;

export function trackOrder(
  orderId: string,
  onData: (update: TrackOrderResponse) => void,
  onEnd: () => void,
  onError: (err: Error) => void
): grpc.ClientReadableStream<TrackOrderResponse> {
  const stream = getStub().TrackOrder({ order_id: orderId });
  stream.on("data", onData);
  stream.on("end", onEnd);
  stream.on("error", onError);
  return stream;
}

// ─────────────────────────────────────────────
//  Pattern 3: CLIENT STREAMING — recordMetrics
//
//  Client writes multiple MetricPing messages to a writable stream,
//  then calls stream.end(). Server sends back a single summary response.
// ─────────────────────────────────────────────
export type MetricPing = RecordMetricsRequest;
export type MetricsSummary = RecordMetricsResponse;

export function recordMetrics(pings: RecordMetricsRequest[]): Promise<RecordMetricsResponse> {
  return new Promise((resolve, reject) => {
    // Get a writable stream with a completion callback
    const stream = getStub().RecordMetrics((err, summary) => {
      if (err) reject(err);
      else resolve(summary);
    });

    // Write each ping to the stream
    for (const ping of pings) {
      stream.write(ping);
    }
    // Signal we are done sending — triggers server to send the summary response
    stream.end();
  });
}

// ─────────────────────────────────────────────
//  Pattern 4: BIDIRECTIONAL STREAMING — openLiveSupport
//
//  Returns a duplex stream. Caller can call stream.write() to send
//  messages and listen to stream.on("data") to receive bot replies.
// ─────────────────────────────────────────────
export type ChatMessage = LiveSupportResponse;

export function openLiveSupport(): grpc.ClientDuplexStream<LiveSupportRequest, LiveSupportResponse> {
  return getStub().LiveSupport();
}

// Protobuf standard naming aliases and exports
export type {
  GetProductRequest,
  GetProductResponse,
  TrackOrderRequest,
  TrackOrderResponse,
  RecordMetricsRequest,
  RecordMetricsResponse,
  LiveSupportRequest,
  LiveSupportResponse,
};
export type LiveSupportRequestMessage = LiveSupportRequest;
export type LiveSupportResponseMessage = LiveSupportResponse;

