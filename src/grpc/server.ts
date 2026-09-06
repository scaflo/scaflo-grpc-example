import * as grpc from "@grpc/grpc-js";
import { getProduct, trackOrder, recordMetrics, liveSupport } from "./handlers.js";
import { proto } from "./proto.js";
import type { InventoryServiceHandlers } from "./types.js";

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server();

  const handlers: InventoryServiceHandlers = {
    GetProduct: getProduct,    // Unary
    TrackOrder: trackOrder,    // Server Streaming
    RecordMetrics: recordMetrics, // Client Streaming
    LiveSupport: liveSupport,   // Bidirectional Streaming
  };

  server.addService(proto.ecommerce.InventoryService.service, handlers);

  return server;
}

export function startGrpcServer(port: number = 50051): Promise<grpc.Server> {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer();

    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(), // no TLS — use createSsl() in prod
      (err, boundPort) => {
        if (err) { reject(err); return; }
        console.log(`\n🚀 gRPC Server running on port ${boundPort}`);
        console.log("   ├── [Unary]         GetProduct");
        console.log("   ├── [Server Stream] TrackOrder");
        console.log("   ├── [Client Stream] RecordMetrics");
        console.log("   └── [Bidi Stream]   LiveSupport\n");
        resolve(server);
      }
    );
  });
}
