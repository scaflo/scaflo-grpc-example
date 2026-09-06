# Scaflo gRPC Example

A production-grade, full-stack showcase demonstrating all **four gRPC communication patterns** built with **Node.js**, **TypeScript**, **Protocol Buffers v3**, an **Express API Gateway**, and **React 19 Server-Side Rendering** powered by [`@scaflo/node-react-wrapper`](https://github.com/scaflo/node-react-wrapper).

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                    Web Browser Client                     │
│    (React 19 Hydrated UI  ·  Interactive Developer Console)│
└──────────────▲─────────────────────────────▲──────────────┘
               │ HTTP GET / POST             │ Server-Sent Events
               ▼                             ▼
┌───────────────────────────────────────────────────────────┐
│              Express API Gateway (Port 3000)              │
│    • SSR Render Engine (@scaflo/node-react-wrapper)        │
│    • HTTP to gRPC Protocol Bridge & Request Validation    │
│    • Real-time SSE Translation for Server Streaming       │
└──────────────────────────────▲────────────────────────────┘
                               │
                               │ HTTP/2 · Protobuf Binary Wire Format
                               ▼
┌───────────────────────────────────────────────────────────┐
│                 gRPC Server (Port 50051)                  │
│    • Service: ecommerce.InventoryService                  │
│    • Implements: Unary, Server/Client/Bidi Streams        │
└───────────────────────────────────────────────────────────┘
```

---

## The 4 gRPC Communication Patterns

This example implements the complete lifecycle for all 4 gRPC streaming topologies defined in [`proto/ecommerce.proto`](proto/ecommerce.proto):

| # | Pattern | gRPC Method | HTTP Gateway Endpoint | Description |
|---|---|---|---|---|
| **1** | **Unary RPC** | `GetProduct` | `GET /api/grpc/product/:id` | Single request yields a single response over HTTP/2. Ideal for low-latency lookups. |
| **2** | **Server Streaming** | `TrackOrder` | `GET /api/grpc/track/:orderId` | Single request opens a persistent stream; server pushes stage updates in real time via Server-Sent Events (SSE). |
| **3** | **Client Streaming** | `RecordMetrics` | `POST /api/grpc/metrics` | Client streams sequential telemetry pings; server ingests all chunks and returns an aggregated summary. |
| **4** | **Bidirectional Streaming** | `LiveSupport` | `POST /api/grpc/support/chat` | Independent, full-duplex read/write stream operating simultaneously over a single HTTP/2 connection. |

---

## Protobuf Service Contract

Defined in [`proto/ecommerce.proto`](proto/ecommerce.proto):

```protobuf
syntax = "proto3";

package ecommerce;

service InventoryService {
  rpc GetProduct     (GetProductRequest)           returns (GetProductResponse);          // Unary
  rpc TrackOrder     (TrackOrderRequest)           returns (stream TrackOrderResponse);   // Server Streaming
  rpc RecordMetrics  (stream RecordMetricsRequest) returns (RecordMetricsResponse);       // Client Streaming
  rpc LiveSupport    (stream LiveSupportRequest)   returns (stream LiveSupportResponse);  // Bidirectional
}
```

---

## Project Structure

```
Scaflo-grpc-example/
├── proto/
│   └── ecommerce.proto        # Protobuf schema definition (InventoryService)
├── src/
│   ├── grpc/
│   │   ├── proto.ts           # Dynamic Protobuf loader (@grpc/proto-loader)
│   │   ├── types.ts           # TypeScript interfaces matching Protobuf definitions
│   │   ├── server.ts          # gRPC Server implementation on port 50051
│   │   ├── client.ts          # Strongly typed client stubs consuming gRPC methods
│   │   └── handlers.ts        # Service method handler implementations
│   ├── data/
│   │   └── mockData.ts        # In-memory datasets (products, orders, bot replies)
│   ├── App.tsx                # Interactive React 19 UI component
│   ├── client.tsx             # Client hydration entry point (hydrateRoot)
│   ├── server.ts              # Express API Gateway & SSR server on port 3000
│   └── testRunner.ts          # CLI automated test suite for all 4 patterns
├── public/
│   ├── styles.css             # Developer console design system
│   ├── client.js              # Bundled React client bundle (esbuild)
│   └── index.html             # Static architecture reference companion page
├── package.json
└── tsconfig.json
```

---

## Getting Started

### Prerequisites

- **Node.js**: v20.0.0 or later
- **pnpm**: v9.0.0 or later (or npm / yarn)

### Installation

```bash
pnpm install
```

### Build Client Bundle

Compile and bundle the React client for browser hydration:

```bash
pnpm run build:client
```

### Run the Development Server

Start both the **gRPC Core Server** (`:50051`) and the **Express API Gateway** (`:3000`) with automatic reload:

```bash
pnpm dev
```

Once running:
- **Interactive React SSR Explorer**: Open [http://localhost:3000](http://localhost:3000)
- **Static Schema Reference**: Open [http://localhost:3000/static](http://localhost:3000/static)

---

## Testing via CLI Test Runner

A standalone end-to-end test suite is included to verify all 4 gRPC patterns directly against the gRPC server:

```bash
pnpm test:grpc
```

Expected output:
- `GetProduct`: Valid product lookup and 404 handling.
- `TrackOrder`: Sequential status events (`RECEIVED` → `PROCESSING` → `DELIVERED`).
- `RecordMetrics`: Uploads 6 telemetry pings and returns mathematical aggregation.
- `LiveSupport`: Full-duplex conversational session between user and bot.

---

## HTTP Gateway API Reference

You can query the gateway using any HTTP client or `curl`:

### 1. Unary RPC — Get Product

```bash
curl http://localhost:3000/api/grpc/product/P001
```

Response:
```json
{
  "pattern": "Unary RPC",
  "description": "Single request → Single response",
  "data": {
    "product_id": "P001",
    "name": "Mechanical Keyboard Pro",
    "category": "Electronics",
    "price": 149.99,
    "stock": 42,
    "description": "Tactile 87-key mechanical keyboard with RGB backlight and Cherry MX switches."
  }
}
```

### 2. Server Streaming — Track Order (SSE)

```bash
curl -N http://localhost:3000/api/grpc/track/ORD-001
```

Response stream:
```
data: {"pattern":"Server Streaming RPC","order_id":"ORD-001","status":"ORDER_STATUS_RECEIVED","progress":10}
data: {"pattern":"Server Streaming RPC","order_id":"ORD-001","status":"ORDER_STATUS_PROCESSING","progress":30}
...
data: {"pattern":"Server Streaming RPC","order_id":"ORD-001","status":"ORDER_STATUS_DELIVERED","progress":100}
data: {"done":true}
```

### 3. Client Streaming — Record Metrics

```bash
curl -X POST http://localhost:3000/api/grpc/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "pings": [
      { "metric_name": "cpu_usage", "value": 72.5, "unit": "%" },
      { "metric_name": "memory_mb", "value": 1024, "unit": "MB" },
      { "metric_name": "response_ms", "value": 143, "unit": "ms" }
    ]
  }'
```

Response:
```json
{
  "pattern": "Client Streaming RPC",
  "description": "Streamed 3 metrics → Got aggregated summary",
  "data": {
    "total_pings": 3,
    "average_value": 413.17,
    "min_value": 72.5,
    "max_value": 1024,
    "total_value": 1239.5,
    "processed_at": "2026-09-06T08:30:00.000Z"
  }
}
```

### 4. Bidirectional Streaming — Live Support Chat

```bash
curl -X POST http://localhost:3000/api/grpc/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "Alice",
    "messages": ["hello", "order", "ORD-001", "thanks"]
  }'
```

Response:
```json
{
  "pattern": "Bidirectional Streaming RPC",
  "description": "Both client & server send streams independently (full-duplex)",
  "data": [
    { "sender": "Alice", "text": "hello", "is_bot": false },
    { "sender": "SupportBot", "text": "Hello. How can I help you today?", "is_bot": true },
    { "sender": "Alice", "text": "order", "is_bot": false },
    { "sender": "SupportBot", "text": "To track your order, please share your order ID (e.g. ORD-001).", "is_bot": true }
  ]
}
```

---

## Scripts & Commands

| Command | Action |
|---|---|
| `pnpm dev` | Starts gRPC server & Express gateway with hot reload |
| `pnpm run build:client` | Bundles React 19 client bundle to `public/client.js` via `esbuild` |
| `pnpm test:grpc` | Executes the CLI end-to-end test suite for all 4 patterns |
| `pnpm run lint` | Runs ESLint checks across the codebase |
| `pnpm build` | Rebuilds client bundle and compiles server assets |

---

## Technologies Used

- **gRPC Core**: [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js) & [`@grpc/proto-loader`](https://www.npmjs.com/package/@grpc/proto-loader)
- **API Gateway**: [Express 5](https://expressjs.com/)
- **Server-Side Rendering**: [`@scaflo/node-react-wrapper`](https://github.com/scaflo/node-react-wrapper)
- **Frontend UI**: [React 19](https://react.dev/)
- **Client Bundler**: [esbuild](https://esbuild.github.io/)
- **Runtime & Execution**: [Node.js](https://nodejs.org/) & [tsx](https://github.com/privatenumber/tsx)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
#   s c a f l o - g r p c - e x a m p l e  
 