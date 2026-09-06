// ═══════════════════════════════════════════════════════
//  gRPC Contract & Service Type Definitions
//
//  Mirrors proto/ecommerce.proto and provides strongly typed
//  interfaces for client stubs, server handlers, and payloads.
// ═══════════════════════════════════════════════════════

import type * as grpc from "@grpc/grpc-js";

// ─────────────────────────────────────────────
//  Enum Definitions
// ─────────────────────────────────────────────
export enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0,
  ORDER_STATUS_RECEIVED = 1,
  ORDER_STATUS_PROCESSING = 2,
  ORDER_STATUS_PACKED = 3,
  ORDER_STATUS_SHIPPED = 4,
  ORDER_STATUS_OUT_FOR_DELIVERY = 5,
  ORDER_STATUS_DELIVERED = 6,
  ORDER_STATUS_FAILED = 7,
}

// ─────────────────────────────────────────────
//  Message Types (Pattern 1: Unary)
// ─────────────────────────────────────────────
export interface GetProductRequest {
  product_id: string;
}

export interface GetProductResponse {
  product_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  description: string;
}

// ─────────────────────────────────────────────
//  Message Types (Pattern 2: Server Streaming)
// ─────────────────────────────────────────────
export interface TrackOrderRequest {
  order_id: string;
}

export interface TrackOrderResponse {
  order_id: string;
  status: OrderStatus | string | number;
  message: string;
  timestamp: string;
  progress: number;
}

// ─────────────────────────────────────────────
//  Message Types (Pattern 3: Client Streaming)
// ─────────────────────────────────────────────
export interface RecordMetricsRequest {
  metric_name: string;
  value: number;
  unit: string;
  timestamp: string;
}

export interface RecordMetricsResponse {
  total_pings: number;
  average_value: number;
  min_value: number;
  max_value: number;
  total_value: number;
  processed_at: string;
}

// ─────────────────────────────────────────────
//  Message Types (Pattern 4: Bidirectional Streaming)
// ─────────────────────────────────────────────
export interface LiveSupportRequest {
  sender: string;
  text: string;
  timestamp: string;
  is_bot: boolean;
}

export interface LiveSupportResponse {
  sender: string;
  text: string;
  timestamp: string;
  is_bot: boolean;
}

// ─────────────────────────────────────────────
//  Client Stub Interface
// ─────────────────────────────────────────────
export interface InventoryServiceClient extends grpc.Client {
  GetProduct(
    argument: GetProductRequest,
    callback: (error: grpc.ServiceError | null, response: GetProductResponse) => void
  ): grpc.ClientUnaryCall;
  GetProduct(
    argument: GetProductRequest,
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null, response: GetProductResponse) => void
  ): grpc.ClientUnaryCall;
  GetProduct(
    argument: GetProductRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: GetProductResponse) => void
  ): grpc.ClientUnaryCall;

  TrackOrder(
    argument: TrackOrderRequest,
    metadata?: grpc.Metadata,
    options?: grpc.CallOptions
  ): grpc.ClientReadableStream<TrackOrderResponse>;

  RecordMetrics(
    callback: (error: grpc.ServiceError | null, response: RecordMetricsResponse) => void
  ): grpc.ClientWritableStream<RecordMetricsRequest>;
  RecordMetrics(
    metadata: grpc.Metadata,
    callback: (error: grpc.ServiceError | null, response: RecordMetricsResponse) => void
  ): grpc.ClientWritableStream<RecordMetricsRequest>;
  RecordMetrics(
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: RecordMetricsResponse) => void
  ): grpc.ClientWritableStream<RecordMetricsRequest>;

  LiveSupport(
    metadata?: grpc.Metadata,
    options?: grpc.CallOptions
  ): grpc.ClientDuplexStream<LiveSupportRequest, LiveSupportResponse>;
}

// ─────────────────────────────────────────────
//  Server Handlers Interface
// ─────────────────────────────────────────────
export interface InventoryServiceHandlers extends grpc.UntypedServiceImplementation {
  GetProduct: grpc.handleUnaryCall<GetProductRequest, GetProductResponse>;
  TrackOrder: grpc.handleServerStreamingCall<TrackOrderRequest, TrackOrderResponse>;
  RecordMetrics: grpc.handleClientStreamingCall<RecordMetricsRequest, RecordMetricsResponse>;
  LiveSupport: grpc.handleBidiStreamingCall<LiveSupportRequest, LiveSupportResponse>;
}

// ─────────────────────────────────────────────
//  Proto Package Definition Interface
// ─────────────────────────────────────────────
export interface InventoryServiceClientConstructor {
  new (
    address: string,
    credentials: grpc.ChannelCredentials,
    options?: grpc.ClientOptions
  ): InventoryServiceClient;
  service: grpc.ServiceDefinition<InventoryServiceHandlers>;
}

export interface ProtoGrpcType {
  ecommerce: {
    InventoryService: InventoryServiceClientConstructor;
    OrderStatus: typeof OrderStatus;
  };
}

declare module "@grpc/grpc-js" {
  interface GrpcObject {
    ecommerce: {
      InventoryService: InventoryServiceClientConstructor;
      OrderStatus: typeof OrderStatus;
    };
  }
}
