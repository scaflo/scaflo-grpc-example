// ═══════════════════════════════════════════════════════
//  CLI TEST RUNNER — Demonstrates all 4 gRPC patterns
//
//  Run with: npx tsx src/testRunner.ts
//  (Make sure `pnpm dev` is running first in another terminal)
// ═══════════════════════════════════════════════════════

import { getProduct, trackOrder, recordMetrics, openLiveSupport } from "./grpc/client.js";

const RESET  = "\x1b[0m";
const BOLD   = "\x1b[1m";
const CYAN   = "\x1b[36m";
const GREEN  = "\x1b[32m";
const PURPLE = "\x1b[35m";
const RED    = "\x1b[31m";
const GREY   = "\x1b[90m";
const ORANGE = "\x1b[33m";

function log(color: string, ...args: unknown[]): void {
  console.log(color, ...args, RESET);
}

function header(num: string, title: string, color: string): void {
  console.log("\n" + color + BOLD + "─".repeat(60) + RESET);
  console.log(color + BOLD + ` ${num} ${title}` + RESET);
  console.log(color + BOLD + "─".repeat(60) + RESET);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────
//  Test 1: Unary RPC
// ─────────────────────────────────────────────
async function testUnary(): Promise<void> {
  header("1️⃣ ", "UNARY RPC — GetProduct", CYAN);
  log(GREY, "Concept: Single request → Single response");
  log(GREY, "Like calling a regular function remotely.\n");

  const ids = ["P001", "P003", "P999"];
  for (const id of ids) {
    try {
      log(CYAN, `→ Calling GetProduct("${id}")...`);
      const product = await getProduct(id);
      log(GREEN, `✅ Response:`, JSON.stringify(product, null, 2));
    } catch (err: unknown) {
      const e = err as { message?: string };
      log(RED, `❌ Error for "${id}": ${e.message}`);
    }
    await sleep(300);
  }
}

// ─────────────────────────────────────────────
//  Test 2: Server Streaming RPC
// ─────────────────────────────────────────────
async function testServerStreaming(): Promise<void> {
  header("2️⃣ ", "SERVER STREAMING RPC — TrackOrder", GREEN);
  log(GREY, "Concept: Single request → Stream of responses");
  log(GREY, "Server pushes multiple updates over one persistent stream.\n");

  return new Promise((resolve) => {
    log(GREEN, '→ Calling TrackOrder("ORD-002")...');
    log(GREY, "  Receiving stream updates:\n");

    trackOrder(
      "ORD-002",
      (update) => {
        const bar = "█".repeat(Math.floor(update.progress / 10)) + "░".repeat(10 - Math.floor(update.progress / 10));
        log(GREEN, `  [${update.progress.toString().padStart(3)}%] ${bar}  ${update.status}`);
        log(GREY, `         → ${update.message}`);
      },
      () => {
        log(GREEN, "\n✅ Stream ended — order tracking complete.");
        resolve();
      },
      (err) => {
        log(RED, "❌ Stream error:", err.message);
        resolve();
      }
    );
  });
}

// ─────────────────────────────────────────────
//  Test 3: Client Streaming RPC
// ─────────────────────────────────────────────
async function testClientStreaming(): Promise<void> {
  header("3️⃣ ", "CLIENT STREAMING RPC — RecordMetrics", ORANGE);
  log(GREY, "Concept: Stream of requests → Single response");
  log(GREY, "Client uploads multiple messages, server aggregates and replies once.\n");

  const pings = [
    { metric_name: "cpu_usage",    value: 65.2, unit: "%",     timestamp: new Date().toISOString() },
    { metric_name: "memory_mb",    value: 2048, unit: "MB",    timestamp: new Date().toISOString() },
    { metric_name: "response_ms",  value: 89,   unit: "ms",    timestamp: new Date().toISOString() },
    { metric_name: "error_rate",   value: 0.3,  unit: "%",     timestamp: new Date().toISOString() },
    { metric_name: "requests_sec", value: 3200, unit: "req/s", timestamp: new Date().toISOString() },
    { metric_name: "disk_iops",    value: 450,  unit: "IOPS",  timestamp: new Date().toISOString() },
  ];

  log(ORANGE, `→ Streaming ${pings.length} metric pings to server...`);
  for (const p of pings) {
    log(GREY, `   write() → ${p.metric_name}: ${p.value} ${p.unit}`);
  }
  log(ORANGE, "   stream.end() → signaling done to server...\n");

  const summary = await recordMetrics(pings);
  log(GREEN, "✅ Server Summary Response:");
  log(GREEN, JSON.stringify(summary, null, 2));
}

// ─────────────────────────────────────────────
//  Test 4: Bidirectional Streaming RPC
// ─────────────────────────────────────────────
async function testBidiStreaming(): Promise<void> {
  header("4️⃣ ", "BIDIRECTIONAL STREAMING — LiveSupport", PURPLE);
  log(GREY, "Concept: Both sides stream independently (full-duplex)");
  log(GREY, "Client and server can read/write simultaneously on the same stream.\n");

  return new Promise((resolve) => {
    const stream = openLiveSupport();
    const conversation = ["hello", "order", "ORD-003", "refund", "no", "thanks"];
    let idx = 0;

    // When bot replies, print it and send the next message
    stream.on("data", (msg) => {
      log(PURPLE, `🤖 Bot:  "${msg.text}"`);

      if (idx < conversation.length) {
        const text = conversation[idx];
        if (text) {
          setTimeout(() => {
            log(ORANGE, `👤 User: "${text}"`);
            stream.write({ sender: "TestUser", text, timestamp: new Date().toISOString(), is_bot: false });
            idx++;
          }, 300);
        }
      } else {
        stream.end();
      }
    });

    stream.on("end", () => {
      log(GREEN, "\n✅ Bidirectional stream closed by both sides.");
      resolve();
    });

    stream.on("error", (err: Error) => {
      log(RED, "❌ Stream error:", err.message);
      resolve();
    });

    // Send first message to kick off the conversation
    const first = conversation[idx];
    if (first) {
      log(ORANGE, `👤 User: "${first}"`);
      stream.write({ sender: "TestUser", text: first, timestamp: new Date().toISOString(), is_bot: false });
      idx++;
    }
  });
}

// ─────────────────────────────────────────────
//  Main: Run all tests sequentially
// ─────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(BOLD + CYAN + "\nScaflo gRPC Example — CLI Test Runner" + RESET);
  console.log(GREY + "   Ensure the server is running: pnpm dev\n" + RESET);

  try {
    await testUnary();
    await sleep(500);
    await testServerStreaming();
    await sleep(500);
    await testClientStreaming();
    await sleep(500);
    await testBidiStreaming();

    console.log(BOLD + GREEN + "\n\n🎉 All 4 gRPC patterns tested successfully!\n" + RESET);
  } catch (err: unknown) {
    const e = err as { message?: string };
    log(RED, "\n❌ Test failed:", e.message);
    log(GREY, "   Is the server running? Try: pnpm dev");
  }

  process.exit(0);
}

main();
