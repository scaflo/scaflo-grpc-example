# Scaflo gRPC Example

A Node.js and TypeScript reference implementation demonstrating all four gRPC communication patterns, paired with an Express API gateway and a React Server-Side Rendered (SSR) web explorer.

---

## Overview

Browsers cannot speak binary HTTP/2 gRPC wire format directly without extra tooling or proxies. This repository demonstrates the common architectural pattern for bridging web clients to gRPC services:

1. **gRPC Backend** (`:50051`): Implements `ecommerce.InventoryService` defined in `proto/ecommerce.proto`.
2. **API Gateway** (`:3000`): Express server that translates incoming HTTP/JSON and Server-Sent Events into typed gRPC calls.
3. **Web Explorer**: React 19 SSR interface (via `@scaflo/node-react-wrapper`) for testing RPC methods directly in the browser.

---

## The 4 Communication Patterns

| Pattern | RPC Method | HTTP Route | Description |
| :--- | :--- | :--- | :--- |
| **Unary** | `GetProduct` | `GET /api/grpc/product/:id` | Single request and single response. |
| **Server Streaming** | `TrackOrder` | `GET /api/grpc/track/:orderId` | Single request; server pushes multiple updates over SSE. |
| **Client Streaming** | `RecordMetrics` | `POST /api/grpc/metrics` | Client streams multiple items; server returns an aggregated summary. |
| **Bidirectional Streaming** | `LiveSupport` | `POST /api/grpc/support/chat` | Full-duplex communication where client and server send messages independently. |

---

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (or npm / yarn)

### 1. Install dependencies
```bash
pnpm install
```

### 2. Build the client bundle
```bash
pnpm run build:client
```

### 3. Start the application
```bash
pnpm dev
```

The gateway will be available at [http://localhost:3000](http://localhost:3000).

- **Web Explorer**: [http://localhost:3000](http://localhost:3000)
- **Static Schema Reference**: [http://localhost:3000/static](http://localhost:3000/static)

---

## CLI Test Suite

Run the automated gRPC test suite (tests all 4 patterns against the gRPC server):

```bash
pnpm test:grpc
```

Example output:
```text
[test] running gRPC pattern suite

  ✔ unary: getProduct("P001") -> Mechanical Keyboard Pro ($149.99)
  ✔ unary: getProduct("P999") -> NOT_FOUND (expected)
  ✔ server streaming: trackOrder("ORD-002") -> 6 stages received (100% DELIVERED)
  ✔ client streaming: recordMetrics (6 pings) -> avg=975.42, total=5852.50
  ✔ bidirectional streaming: liveSupport (6 responses received)

All 4 gRPC patterns passed.
```

---

## cURL Examples

### 1. Unary RPC
```bash
curl -s http://localhost:3000/api/grpc/product/P001
```
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

### 2. Server Streaming (SSE)
```bash
curl -N http://localhost:3000/api/grpc/track/ORD-001
```
```text
data: {"pattern":"Server Streaming RPC","order_id":"ORD-001","status":1,"message":"Your order has been received and confirmed.","timestamp":"...","progress":10}

data: {"pattern":"Server Streaming RPC","order_id":"ORD-001","status":2,"message":"Payment verified. Picking items from warehouse.","timestamp":"...","progress":30}

data: {"done":true}
```

### 3. Client Streaming
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

### 4. Bidirectional Streaming
```bash
curl -X POST http://localhost:3000/api/grpc/support/chat \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "Alice",
    "messages": ["hello", "order", "ORD-001", "thanks"]
  }'
```

---

## Project Structure

```text
├── proto/
│   └── ecommerce.proto        # Protocol Buffers service definition
├── src/
│   ├── services/
│   │   └── grpc/              # Backend gRPC service (:50051)
│   │       ├── handlers.ts    # RPC handlers for all 4 patterns
│   │       ├── server.ts      # gRPC server factory & bind
│   │       ├── proto.ts       # Dynamic protobuf loader
│   │       └── types.ts       # Protobuf TypeScript types
│   ├── clients/
│   │   └── grpc/              # gRPC client consumer stubs
│   │       └── index.ts       # Typed client wrappers
│   ├── gateway/               # Express API gateway (:3000)
│   │   ├── app.ts             # Express setup & middleware
│   │   └── routes/
│   │       ├── api.ts         # /api/grpc/* HTTP/SSE endpoints
│   │       └── web.ts         # / (SSR) and /static routes
│   ├── ssr/                   # Frontend & SSR layer
│   │   ├── App.tsx            # React 19 interactive explorer
│   │   ├── client.tsx         # Client browser hydration entrypoint
│   │   └── render.ts          # SSR rendering helper (@scaflo/node-react-wrapper)
│   ├── data/
│   │   └── mockData.ts        # In-memory fixtures (products, orders, chat)
│   ├── test/
│   │   └── testRunner.ts      # CLI integration test suite
│   └── server.ts              # Application bootstrap orchestrator
├── public/
│   ├── client.js              # Compiled client bundle (esbuild)
│   ├── index.html             # Static schema reference page
│   └── styles.css             # UI stylesheet
├── package.json
└── tsconfig.json
```

---

## Scripts

- `pnpm dev`: Start the application in development mode with `tsx watch`.
- `pnpm build:client`: Compile and bundle the React hydration code into `public/client.js`.
- `pnpm test:grpc`: Run the automated integration test suite against the running server.
- `pnpm run lint`: Run ESLint checks.