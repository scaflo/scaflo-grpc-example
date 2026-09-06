import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const relativeProto = path.resolve(__dirname, "../../proto/ecommerce.proto");
const PROTO_PATH = fs.existsSync(relativeProto)
  ? relativeProto
  : path.resolve(process.cwd(), "proto/ecommerce.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

export const proto = grpc.loadPackageDefinition(packageDefinition);
