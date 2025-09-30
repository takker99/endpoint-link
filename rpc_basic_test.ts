import { expose, wrap } from "./mod.ts";
import type { Endpoint } from "./shared_types.ts";

// Simple assert functions (avoiding @std/assert dependency issues)
function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${expected}, got ${actual}`);
  }
}

async function assertRejects(
  fn: () => Promise<unknown>,
  // deno-lint-ignore no-explicit-any
  ErrorClass?: new (...args: any[]) => Error,
  msgIncludes?: string,
) {
  try {
    await fn();
    throw new Error("Expected promise to reject, but it resolved");
  } catch (error) {
    if (ErrorClass && !(error instanceof ErrorClass)) {
      throw new Error(
        `Expected error to be instance of ${ErrorClass.name}, got ${error?.constructor?.name}`,
      );
    }
    if (msgIncludes && !String(error).includes(msgIncludes)) {
      throw new Error(
        `Expected error message to include "${msgIncludes}", got "${error}"`,
      );
    }
  }
}

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

Deno.test("RPC basic success (value + Promise)", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    add(a: number, b: number, _s?: AbortSignal) {
      return a + b;
    },
    mul(a: number, b: number, _s?: AbortSignal) {
      return Promise.resolve(a * b);
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["add", "mul"]);
  assertEquals(await api.add(1, 2), 3);
  assertEquals(await api.mul(2, 3), 6);

  // Test call method as well
  assertEquals(await api.call("add", 4, 5), 9);

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC error propagation", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    boom(_n: number, _s?: AbortSignal) {
      throw new Error("boom");
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["boom"]);
  await assertRejects(() => api.boom(1), Error, "boom");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC abort via AbortSignal", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    longTask(_ms: number, signal?: AbortSignal): Promise<string> {
      // Simplified test that just checks if abort signal works
      if (signal?.aborted) {
        throw new Error("aborted");
      }

      // Return immediately to avoid timer leaks in test
      return Promise.resolve("done");
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["longTask"]);

  // Test with pre-aborted signal
  const ac = new AbortController();
  ac.abort();
  await assertRejects(() => api.longTask(200, ac.signal), Error, "aborted");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("Transferable ArrayBuffer is passed", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    len(buf: ArrayBuffer, _s?: AbortSignal) {
      return (buf.byteLength ?? 0) as number;
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["len"]);
  const buf = new Uint8Array([1, 2, 3]).buffer;
  const n = await api.len(buf);
  assertEquals(n, 3);

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC handles missing handler", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    existing() {
      return "exists";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["existing"]);

  // Call non-existent method
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    () => api.call("nonexistent" as any),
    Error,
    "no handler: nonexistent",
  );

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC handles Promise arguments", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    concat(str1: string, str2: string, _s?: AbortSignal) {
      return str1 + str2;
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["concat"]);

  // Pass Promise as argument - should be resolved before sending
  const promiseArg = Promise.resolve("world");
  const result = await api.concat("hello", promiseArg);
  assertEquals(result, "helloworld");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC handles active abort signal", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    checkAbort(_s?: AbortSignal) {
      // Handler immediately checks abort status
      return "should not reach here";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["checkAbort"]);

  // Create already-aborted signal
  const ac = new AbortController();
  ac.abort();

  // Should immediately reject due to pre-aborted signal
  await assertRejects(() => api.checkAbort(ac.signal), Error, "aborted");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC wrap without methodNames creates basic API", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  const exposedHandlers = expose(a, handlers);
  // Don't pass methodNames - should only have call() and close()
  const api = wrap<typeof handlers>(b);

  // Should work with call method
  assertEquals(await api.call("test"), "success");

  // Should not have direct method (since methodNames not provided)
  // deno-lint-ignore no-explicit-any
  assertEquals(typeof (api as any).test, "undefined");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("utils.isAbortSignal works correctly", async () => {
  // Import utils to test directly
  const { isAbortSignal } = await import("./utils.ts");

  const ac = new AbortController();
  assertEquals(isAbortSignal(ac.signal), true);
  assertEquals(isAbortSignal({}), false);
  assertEquals(isAbortSignal(null), false);
  assertEquals(isAbortSignal(undefined), false);
  assertEquals(isAbortSignal({ aborted: true }), false); // Missing addEventListener
});
