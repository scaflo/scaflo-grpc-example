import * as grpc from "@grpc/grpc-js";
import { getProduct, trackOrder, recordMetrics, liveSupport } from "./handlers.js";
import { proto } from "./proto.js";
import type { InventoryServiceHandlers } from "./types.js";

export function createGrpcServer(): grpc.Server {
  const server = new grpc.Server();

  const handlers: InventoryServiceHandlers = {
    GetProduct: getProduct,
    TrackOrder: trackOrder,
    RecordMetrics: recordMetrics,
    LiveSupport: liveSupport,
  };

  server.addService(proto.ecommerce.InventoryService.service, handlers);

  return server;
}

export function startGrpcServer(port: number = 50051): Promise<grpc.Server> {
  return new Promise((resolve, reject) => {
    const server = createGrpcServer();

    server.bindAsync(
      `0.0.0.0:${port}`,
      grpc.ServerCredentials.createInsecure(),
      (err, boundPort) => {
        if (err) { reject(err); return; }
        // eslint-disable-next-line no-console
        console.log(`[grpc] server listening on :${boundPort}`);
        resolve(server);
      }
    );
  });
}
