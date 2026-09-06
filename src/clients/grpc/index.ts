import * as grpc from "@grpc/grpc-js";
import { proto } from "../../services/grpc/proto.js";
import type {
  InventoryServiceClient,
  GetProductResponse,
  TrackOrderResponse,
  RecordMetricsRequest,
  RecordMetricsResponse,
  LiveSupportRequest,
  LiveSupportResponse,
} from "../../services/grpc/types.js";

// Direct gRPC client instance
export const client: InventoryServiceClient = new proto.ecommerce.InventoryService(
  process.env.GRPC_ADDRESS ?? "localhost:50051",
  grpc.credentials.createInsecure()
);

/**
 * Pattern 1: Unary RPC
 */
export function getProduct(productId: string): Promise<GetProductResponse> {
  return new Promise((resolve, reject) => {
    client.GetProduct({ product_id: productId }, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

/**
 * Pattern 2: Server Streaming RPC
 */
export function trackOrder(
  orderId: string,
  onData: (update: TrackOrderResponse) => void,
  onEnd: () => void,
  onError: (err: Error) => void
): grpc.ClientReadableStream<TrackOrderResponse> {
  const stream = client.TrackOrder({ order_id: orderId });
  stream.on("data", onData);
  stream.on("end", onEnd);
  stream.on("error", onError);
  return stream;
}

/**
 * Pattern 3: Client Streaming RPC
 */
export function recordMetrics(pings: RecordMetricsRequest[]): Promise<RecordMetricsResponse> {
  return new Promise((resolve, reject) => {
    const stream = client.RecordMetrics((err, summary) => {
      if (err) reject(err);
      else resolve(summary);
    });

    for (const ping of pings) {
      stream.write(ping);
    }
    stream.end();
  });
}

/**
 * Pattern 4: Bidirectional Streaming RPC
 */
export function openLiveSupport(): grpc.ClientDuplexStream<LiveSupportRequest, LiveSupportResponse> {
  return client.LiveSupport();
}

// Re-export protobuf types
export type {
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

