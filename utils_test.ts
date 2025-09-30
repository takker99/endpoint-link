import {
  genId,
  isAbortSignal,
  post,
  signalReady,
  waitForReady,
} from "./utils.ts";
import type { Endpoint } from "./shared_types.ts";
import { assertEquals, assertRejects } from "@std/assert";

// Helper: make an in-memory Endpoint using MessageChannel
function memoryPair(): [Endpoint, Endpoint] {
  const mc = new MessageChannel();
  // Both ports are Endpoint-like; start them to ensure message delivery
  // deno-lint-ignore no-explicit-any
  const port1 = mc.port1 as any as Endpoint;
  // deno-lint-ignore no-explicit-any
  const port2 = mc.port2 as any as Endpoint;

  // Start ports to ensure message delivery
  if (port1.start) port1.start();
  if (port2.start) port2.start();

  return [port1, port2];
}

// Helper to close MessageChannel ports properly
function closePorts(a: Endpoint, b: Endpoint) {
  // deno-lint-ignore no-explicit-any
  if ((a as any).close) (a as any).close();
  // deno-lint-ignore no-explicit-any
  if ((b as any).close) (b as any).close();
}

Deno.test("utils.isAbortSignal works correctly", () => {
  const ac = new AbortController();
  assertEquals(isAbortSignal(ac.signal), true);
  assertEquals(isAbortSignal({}), false);
  assertEquals(isAbortSignal(null), false);
  assertEquals(isAbortSignal(undefined), false);
  assertEquals(isAbortSignal({ aborted: true }), false); // Missing addEventListener
});

Deno.test("utils.post handles transferables", async () => {
  const [a, b] = memoryPair();

  // Test with transferable array buffer
  const buf = new Uint8Array([1, 2, 3]).buffer;
  // deno-lint-ignore no-explicit-any
  let receivedData: any;

  // Set up listener before posting
  const cleanup = (() => {
    const controller = new AbortController();
    // deno-lint-ignore no-explicit-any
    const handler = (ev: any) => receivedData = ev.data;
    b.addEventListener("message", handler, { signal: controller.signal });
    return controller.abort.bind(controller);
  })();

  // Post with transferables
  post(a, { test: "data", buf }, [buf]);

  // Give it time to arrive
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(receivedData?.test, "data");

  cleanup();
  closePorts(a, b);
});

Deno.test("utils.post fallback when transferables fail", () => {
  // Create a mock endpoint that throws on postMessage with transferables
  const mockEndpoint = {
    // deno-lint-ignore no-explicit-any
    postMessage(_msg: any, transfer?: any) {
      if (transfer && transfer.length) {
        throw new Error("Transferables not supported");
      }
      // Success without transferables
    },
  };

  // Should not throw, should fallback to posting without transfer
  // deno-lint-ignore no-explicit-any
  post(mockEndpoint as any, { test: "data" }, [new ArrayBuffer(10)]);
});

Deno.test("utils.genId fallback when crypto fails", () => {
  // Mock crypto.getRandomValues to throw
  const originalGetRandomValues = crypto.getRandomValues;
  // deno-lint-ignore no-explicit-any
  (crypto as any).getRandomValues = () => {
    throw new Error("Crypto not available");
  };

  try {
    const id = genId();
    assertEquals(typeof id, "string");
    assertEquals(id.length > 0, true);
    // Should be Math.random based, which has different format
  } finally {
    // Restore original crypto
    // deno-lint-ignore no-explicit-any
    (crypto as any).getRandomValues = originalGetRandomValues;
  }
});

Deno.test("utils.signalReady sends ready message", async () => {
  const [a, b] = memoryPair();

  // deno-lint-ignore no-explicit-any
  let receivedMessage: any;
  const cleanup = (() => {
    const controller = new AbortController();
    // deno-lint-ignore no-explicit-any
    const handler = (ev: any) => receivedMessage = ev.data;
    b.addEventListener("message", handler, { signal: controller.signal });
    return controller.abort.bind(controller);
  })();

  signalReady(a);

  // Give it time to arrive
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(receivedMessage?.kind, "ready");

  cleanup();
  closePorts(a, b);
});

Deno.test("utils.waitForReady resolves when ready message received", async () => {
  const [a, b] = memoryPair();

  // Start waiting for ready
  const readyPromise = waitForReady(b, 1000);

  // Send ready message after a short delay
  setTimeout(() => signalReady(a), 10);

  // Should resolve without throwing
  await readyPromise;

  closePorts(a, b);
});

Deno.test("utils.waitForReady times out when no ready message", async () => {
  const [a, b] = memoryPair();

  // Wait for ready with a very short timeout
  await assertRejects(
    () => waitForReady(b, 50),
    Error,
    "Endpoint readiness timeout after 50ms",
  );

  closePorts(a, b);
});
