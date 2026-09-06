import express, { type Express } from "express";
import path from "node:path";
import { webRouter } from "./routes/web.js";
import { apiRouter } from "./routes/api.js";

export function createGatewayApp(): Express {
  const app = express();

  app.use(express.json());

  // Serve static assets without auto-intercepting "/" with index.html
  const publicDir = path.resolve(process.cwd(), "public");
  app.use(express.static(publicDir, { index: false }));

  // Mount web routes (/ and /static)
  app.use("/", webRouter);

  // Mount gRPC API gateway routes (/api/grpc/*)
  app.use("/api/grpc", apiRouter);

  return app;
}
