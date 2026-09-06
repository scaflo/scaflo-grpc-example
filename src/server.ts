import { startGrpcServer } from "./services/grpc/server.js";
import { createGatewayApp } from "./gateway/app.js";

const PORT = 3000;
const GRPC_PORT = 50051;

startGrpcServer(GRPC_PORT)
  .then(() => {
    const app = createGatewayApp();
    app.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`[gateway] listening on http://localhost:${PORT}`);
    });
  })
  .catch((err: unknown) => {
    console.error("Failed to start gRPC server:", err);
    process.exit(1);
  });
