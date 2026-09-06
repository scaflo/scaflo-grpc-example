/* eslint-disable no-console */
import { getProduct, trackOrder, recordMetrics, openLiveSupport } from "../clients/grpc/index.js";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function testUnary(): Promise<void> {
  // Test valid lookup
  const product = await getProduct("P001");
  console.log(`  ${GREEN}✔${RESET} unary: getProduct("P001") -> ${product.name} ($${product.price})`);

  // Test not-found handling
  try {
    await getProduct("P999");
    throw new Error("Expected NOT_FOUND for P999, but call succeeded");
  } catch (err: unknown) {
    const e = err as { code?: number; message?: string };
    if (e.code === 5 || (e.message && e.message.includes("not found"))) {
      console.log(`  ${GREEN}✔${RESET} unary: getProduct("P999") -> NOT_FOUND (expected)`);
    } else {
      throw err;
    }
  }
}

async function testServerStreaming(): Promise<void> {
  return new Promise((resolve, reject) => {
    let updatesReceived = 0;
    let lastStatus = "";

    trackOrder(
      "ORD-002",
      (update) => {
        updatesReceived++;
        lastStatus = `${update.progress}% ${update.status}`;
      },
      () => {
        console.log(`  ${GREEN}✔${RESET} server streaming: trackOrder("ORD-002") -> ${updatesReceived} stages received (${lastStatus})`);
        resolve();
      },
      (err) => {
        reject(err);
      }
    );
  });
}

async function testClientStreaming(): Promise<void> {
  const pings = [
    { metric_name: "cpu_usage", value: 65.2, unit: "%", timestamp: new Date().toISOString() },
    { metric_name: "memory_mb", value: 2048, unit: "MB", timestamp: new Date().toISOString() },
    { metric_name: "response_ms", value: 89, unit: "ms", timestamp: new Date().toISOString() },
    { metric_name: "error_rate", value: 0.3, unit: "%", timestamp: new Date().toISOString() },
    { metric_name: "requests_sec", value: 3200, unit: "req/s", timestamp: new Date().toISOString() },
    { metric_name: "disk_iops", value: 450, unit: "IOPS", timestamp: new Date().toISOString() },
  ];

  const summary = await recordMetrics(pings);
  console.log(
    `  ${GREEN}✔${RESET} client streaming: recordMetrics (${pings.length} pings) -> avg=${summary.average_value.toFixed(2)}, total=${summary.total_value.toFixed(2)}`
  );
}

async function testBidiStreaming(): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = openLiveSupport();
    const conversation = ["hello", "order", "ORD-003", "refund", "no", "thanks"];
    let idx = 0;
    let botReplies = 0;

    stream.on("data", () => {
      botReplies++;
      if (idx < conversation.length) {
        const text = conversation[idx];
        if (text) {
          setTimeout(() => {
            stream.write({ sender: "TestUser", text, timestamp: new Date().toISOString(), is_bot: false });
            idx++;
          }, 100);
        }
      } else {
        stream.end();
      }
    });

    stream.on("end", () => {
      console.log(`  ${GREEN}✔${RESET} bidirectional streaming: liveSupport (${botReplies} responses received)`);
      resolve();
    });

    stream.on("error", (err: Error) => {
      reject(err);
    });

    const first = conversation[idx];
    if (first) {
      stream.write({ sender: "TestUser", text: first, timestamp: new Date().toISOString(), is_bot: false });
      idx++;
    }
  });
}

async function main(): Promise<void> {
  console.log(`\n[test] running gRPC pattern suite\n`);

  try {
    await testUnary();
    await sleep(200);
    await testServerStreaming();
    await sleep(200);
    await testClientStreaming();
    await sleep(200);
    await testBidiStreaming();

    console.log(`\n${GREEN}All 4 gRPC patterns passed.${RESET}\n`);
  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error(`\n${RED}Test failed:${RESET}`, e.message);
    console.log(`${DIM}Ensure the server is running with 'pnpm dev'${RESET}\n`);
    process.exit(1);
  }

  process.exit(0);
}

main();
