import { startGrpcServer } from "./services/grpc/server.js";
import { createGatewayApp } from "./gateway/app.js";

const PORT = 3000;
const GRPC_PORT = 50051;

startGrpcServer(GRPC_PORT)
  .then((grpcServer) => {
    const app = createGatewayApp();
    const server = app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[gateway] listening on http://localhost:${PORT}`);
    });

    const shutdown = () => {
      grpcServer.forceShutdown();
      server.close();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((err: unknown) => {
    console.error("Failed to start gRPC server:", err);
    process.exit(1);
  });



