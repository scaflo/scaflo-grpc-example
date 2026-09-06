# Scaflo gRPC Example

A production-ready reference application showcasing all **four gRPC communication patterns** in **Node.js** and **TypeScript**, bridged to a **React 19 Server-Side Rendered (SSR)** web interface via an **Express API Gateway**.

[![gRPC](https://img.shields.io/badge/gRPC-v1.14-244c5a?logo=grpc)](https://grpc.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19.x-61dafb?logo=react)](https://react.dev/)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express)](https://expressjs.com/)
[![License](https://img.shields.io/badge/license-ISC-green.svg)](LICENSE)

---

## Table of Contents

- [Why This Project Exists](#why-this-project-exists)
- [Architecture & Data Flow](#architecture--data-flow)
- [The 4 gRPC Communication Patterns](#the-4-grpc-communication-patterns)
  - [1. Unary RPC (`GetProduct`)](#1-unary-rpc-getproduct)
  - [2. Server Streaming RPC (`TrackOrder`)](#2-server-streaming-rpc-trackorder)
  - [3. Client Streaming RPC (`RecordMetrics`)](#3-client-streaming-rpc-recordmetrics)
  - [4. Bidirectional Streaming RPC (`LiveSupport`)](#4-bidirectional-streaming-rpc-livesupport)
- [Quick Start](#quick-start)
- [Project Layout](#project-layout)
- [CLI Verification Suite](#cli-verification-suite)
- [API Gateway Reference (cURL)](#api-gateway-reference-curl)
- [Troubleshooting & Common Gotchas](#troubleshooting--common-gotchas)
- [Tech Stack](#tech-stack)

---

## Why This Project Exists

Standard web browsers cannot speak raw HTTP/2 gRPC wire format directly without specialized proxies or gRPC-Web framing. 

This repository demonstrates the **API Gateway Pattern**:
1. A **gRPC Server** (`:50051`) implements high-performance, strictly typed RPC services defined in `.proto` files.
2. An **Express Gateway** (`:3000`) translates browser-friendly HTTP requests (REST, JSON, Server-Sent Events) into binary gRPC calls over HTTP/2.
3. A **React 19 SSR Engine** (via [`@scaflo/node-react-wrapper`](https://github.com/scaflo/node-react-wrapper)) serves an interactive, hydrated developer console without requiring full Next.js or Vite infrastructure.

---

## Architecture & Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Web Browser Client                              │
│              React 19 Interactive Developer Console (Port 3000)             │
└───────────────────────▲─────────────────────────────▲───────────────────────┘
                        │ Standard HTTP (JSON)        │ Server-Sent Events (SSE)
                        ▼                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Express Gateway (Port 3000)                           │
│   • Server-Side Rendering via @scaflo/node-react-wrapper                    │
│   • Input schema validation and parameter trimming                          │
│   • Protocol translation: HTTP JSON ↔ gRPC Protobuf payloads                │
│   • Stream lifecycle management and connection abort cleanup                │
└───────────────────────────────────────▲─────────────────────────────────────┘
                                        │
                                        │ Multiplexed HTTP/2 Streams
                                        │ (gRPC Binary Wire Protocol)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         gRPC Core (Port 50051)                              │
│   • Service: ecommerce.InventoryService                                     │
│   • Schema: proto/ecommerce.proto                                           │
│   • Implements: Unary, Server Streaming, Client Streaming, Duplex Chat     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The 4 gRPC Communication Patterns

All patterns are defined in [`proto/ecommerce.proto`](proto/ecommerce.proto) and implemented end-to-end:

### 1. Unary RPC (`GetProduct`)
- **Concept**: Classic point-to-point remote procedure call. Single request $\rightarrow$ single response.
- **Use Case**: CRUD lookups, authentication, standard transactional queries.
- **Protobuf Signature**:
  ```protobuf
  rpc GetProduct(GetProductRequest) returns (GetProductResponse);
  ```
- **Gateway Route**: `GET /api/grpc/product/:id`

### 2. Server Streaming RPC (`TrackOrder`)
- **Concept**: The client sends a single request; the server keeps the channel open and pushes a continuous stream of events.
- **Use Case**: Live order/shipment tracking, stock tickers, notification feeds, log streaming.
- **Web Solution**: The gateway bridges the gRPC readable stream into **Server-Sent Events (SSE)** so browsers can listen natively via `EventSource`.
- **Protobuf Signature**:
  ```protobuf
  rpc TrackOrder(TrackOrderRequest) returns (stream TrackOrderResponse);
  ```
- **Gateway Route**: `GET /api/grpc/track/:orderId`

### 3. Client Streaming RPC (`RecordMetrics`)
- **Concept**: The client uploads multiple messages over time; once done, the server aggregates the stream and returns a single summary response.
- **Use Case**: Telemetry ingestion, IoT sensor pings, bulk file chunk uploads, batch data sync.
- **Protobuf Signature**:
  ```protobuf
  rpc RecordMetrics(stream RecordMetricsRequest) returns (RecordMetricsResponse);
  ```
- **Gateway Route**: `POST /api/grpc/metrics`

### 4. Bidirectional Streaming RPC (`LiveSupport`)
- **Concept**: Full-duplex communication. Both client and server read and write independently over the same HTTP/2 stream simultaneously.
- **Use Case**: Live customer support, collaborative editing, gaming state exchange.
- **Protobuf Signature**:
  ```protobuf
  rpc LiveSupport(stream LiveSupportRequest) returns (stream LiveSupportResponse);
  ```
- **Gateway Route**: `POST /api/grpc/support/chat`

---

## Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Build Client Bundle
Builds the self-contained React 19 hydration bundle via `esbuild`:
```bash
pnpm run build:client
```

### 3. Start Development Server
Starts the gRPC backend (`:50051`) and the Express SSR gateway (`:3000`) with auto-reload:
```bash
pnpm dev
```

### 4. Open in Browser
- **Live Interactive Console**: [http://localhost:3000](http://localhost:3000)
- **Static Contract Reference**: [http://localhost:3000/static](http://localhost:3000/static)

---

## Project Layout

```
scaflo-grpc-example/
├── proto/
│   └── ecommerce.proto        # Protobuf schema definition (InventoryService)
├── src/
│   ├── grpc/
│   │   ├── proto.ts           # Dynamic Protobuf loader (@grpc/proto-loader)
│   │   ├── types.ts           # TypeScript type definitions mirror for proto messages
│   │   ├── server.ts          # gRPC Server initialization (0.0.0.0:50051)
│   │   ├── client.ts          # Typed client stubs consuming the gRPC server
│   │   └── handlers.ts        # Business logic handlers for all 4 RPC patterns
│   ├── data/
│   │   └── mockData.ts        # In-memory mock databases (products, orders, bot responses)
│   ├── App.tsx                # Interactive React 19 developer console component
│   ├── client.tsx             # Client hydration entry point (hydrateRoot)
│   ├── server.ts              # Express API Gateway, SSR server, & route controllers
│   └── testRunner.ts          # CLI automated test suite testing all 4 patterns
├── public/
│   ├── styles.css             # Dedicated design system for console and docs
│   ├── client.js              # Bundled client asset for browser hydration (esbuild)
│   └── index.html             # Static architecture reference companion page
├── package.json
└── tsconfig.json
```

---

## CLI Verification Suite

Verify all 4 gRPC patterns directly against the running server without a browser:

```bash
pnpm test:grpc
```

The test runner will execute:
1. `GetProduct("P001")` $\rightarrow$ verifies Unary response payload.
2. `GetProduct("P999")` $\rightarrow$ verifies gRPC `5 NOT_FOUND` error handling.
3. `TrackOrder("ORD-002")` $\rightarrow$ streams all 6 fulfillment stages from 10% to 100%.
4. `RecordMetrics([...])` $\rightarrow$ writes 6 metric pings and validates aggregated statistics.
5. `LiveSupport()` $\rightarrow$ runs a full-duplex conversational session between user and bot.

---

## API Gateway Reference (cURL)

### 1. Unary RPC — Get Product
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

### 2. Server Streaming — Track Order (SSE)
```bash
curl -N http://localhost:3000/api/grpc/track/ORD-001
```
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

## Troubleshooting & Common Gotchas

### 1. `EADDRINUSE: address already in use 0.0.0.0:50051`
If a background Node process is still holding port 50051, find and terminate it:
```powershell
# Windows PowerShell
Get-NetTCPConnection -LocalPort 50051 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```
```bash
# macOS / Linux
lsof -ti:50051 | xargs kill -9
```

### 2. Browser Hydration Error (`Failed to resolve module specifier`)
If you modify `src/App.tsx` or `src/client.tsx`, re-run `pnpm run build:client`. The client must be bundled with `esbuild` so `react` and `react-dom` are packaged directly into `public/client.js` rather than emitted as bare imports.

---

## Tech Stack

- **Protocol Buffers**: Dynamic schema loading via [`@grpc/proto-loader`](https://www.npmjs.com/package/@grpc/proto-loader).
- **gRPC Core**: Official pure JavaScript/TypeScript implementation [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js).
- **API Gateway**: [Express 5](https://expressjs.com/).
- **SSR Wrapper**: Lightweight server rendering via [`@scaflo/node-react-wrapper`](https://github.com/scaflo/node-react-wrapper).
- **Client Bundler**: High-speed bundling via [esbuild](https://esbuild.github.io/).
- **Testing**: Native CLI integration testing with [tsx](https://github.com/privatenumber/tsx).