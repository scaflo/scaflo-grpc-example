import * as grpc from "@grpc/grpc-js";
import { proto } from "../../services/grpc/proto.js";
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
} from "../../services/grpc/types.js";

function createStub(address: string = "localhost:50051"): InventoryServiceClient {
  return new proto.ecommerce.InventoryService(
    address,
    grpc.credentials.createInsecure()
  );
}

let _stub: InventoryServiceClient | null = null;
function getStub(): InventoryServiceClient {
  if (!_stub) _stub = createStub();
  return _stub;
}

export type ProductResponse = GetProductResponse;

/**
 * Pattern 1: Unary RPC
 */
export function getProduct(productId: string): Promise<GetProductResponse> {
  return new Promise((resolve, reject) => {
    getStub().GetProduct({ product_id: productId }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

export type OrderStatusUpdate = TrackOrderResponse;

/**
 * Pattern 2: Server Streaming RPC
 */
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

export type MetricPing = RecordMetricsRequest;
export type MetricsSummary = RecordMetricsResponse;

/**
 * Pattern 3: Client Streaming RPC
 */
export function recordMetrics(pings: RecordMetricsRequest[]): Promise<RecordMetricsResponse> {
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

export type ChatMessage = LiveSupportResponse;

/**
 * Pattern 4: Bidirectional Streaming RPC
 */
export function openLiveSupport(): grpc.ClientDuplexStream<LiveSupportRequest, LiveSupportResponse> {
  return getStub().LiveSupport();
}

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
