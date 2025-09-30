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

Deno.test("utils.post handles transferables", async () => {
  const { post } = await import("./utils.ts");
  const [a, b] = memoryPair();

  // Test with transferable array buffer
  const buf = new Uint8Array([1, 2, 3]).buffer;
  // deno-lint-ignore no-explicit-any
  let receivedData: any;

  // Set up listener before posting
  const cleanup = b.addEventListener
    ? (() => {
      // deno-lint-ignore no-explicit-any
      const handler = (ev: any) => receivedData = ev.data;
      b.addEventListener("message", handler);
      return () =>
        b.removeEventListener && b.removeEventListener("message", handler);
    })()
    : (() => {
      // deno-lint-ignore no-explicit-any
      const prev = (b as any).onmessage;
      // deno-lint-ignore no-explicit-any
      (b as any).onmessage = (ev: any) => receivedData = ev.data;
      // deno-lint-ignore no-explicit-any
      return () => (b as any).onmessage = prev;
    })();

  // Post with transferables
  post(a, { test: "data", buf }, [buf]);

  // Give it time to arrive
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(receivedData?.test, "data");

  cleanup();
  closePorts(a, b);
});

Deno.test("utils.post fallback when transferables fail", async () => {
  const { post } = await import("./utils.ts");

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

Deno.test("utils.on with onmessage fallback", async () => {
  const { on } = await import("./utils.ts");

  // Create endpoint that only supports onmessage (not addEventListener)
  const mockEndpoint = {
    // deno-lint-ignore no-explicit-any
    onmessage: null as any,
  };

  // deno-lint-ignore no-explicit-any
  let received: any;
  // deno-lint-ignore no-explicit-any
  const cleanup = on(mockEndpoint as any, (data) => {
    received = data;
  });

  // Simulate message
  if (mockEndpoint.onmessage) {
    mockEndpoint.onmessage({ data: "test-message" });
  }

  assertEquals(received, "test-message");

  // Test cleanup restores previous handler
  const prevHandler = () => {};
  mockEndpoint.onmessage = prevHandler;
  // deno-lint-ignore no-explicit-any
  const cleanup2 = on(mockEndpoint as any, () => {});
  cleanup2();
  assertEquals(mockEndpoint.onmessage, prevHandler);

  cleanup();
});

Deno.test("utils.on with no message support", async () => {
  const { on } = await import("./utils.ts");

  // Create endpoint that supports neither addEventListener nor onmessage
  const mockEndpoint = {};

  // Should return no-op cleanup function
  // deno-lint-ignore no-explicit-any
  const cleanup = on(mockEndpoint as any, () => {});
  cleanup(); // Should not throw
});

Deno.test("utils.genId fallback when crypto fails", async () => {
  const { genId } = await import("./utils.ts");

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

Deno.test("RPC expose handles cancel messages", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    slowTask(ms: number, signal?: AbortSignal): Promise<string> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve("completed"), ms);
        if (signal?.aborted) {
          clearTimeout(timeout);
          reject(new Error("aborted"));
          return;
        }
        if (signal) {
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new Error("aborted"));
          });
        }
      });
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["slowTask"]);

  const controller = new AbortController();

  // Start a task and then abort it
  const promise = api.slowTask(1000, controller.signal); // Longer timeout

  // Abort immediately to ensure abort happens before completion
  controller.abort();

  await assertRejects(() => promise, Error, "aborted");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose handles malformed data", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);

  // Send malformed data that should be ignored
  a.postMessage(null);
  a.postMessage(undefined);
  a.postMessage({});
  a.postMessage({ kind: "unknown" });

  // Regular call should still work
  const api = wrap<typeof handlers>(b, ["test"]);
  assertEquals(await api.test(), "works");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose error when handler throws null/undefined", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    throwsNull() {
      throw null;
    },
    throwsUndefined() {
      throw undefined;
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["throwsNull", "throwsUndefined"]);

  await assertRejects(() => api.throwsNull(), Error, "unknown");
  await assertRejects(() => api.throwsUndefined(), Error, "unknown");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose handles legacy cancel message format", async () => {
  const [a, b] = memoryPair();

  // Set up a direct cancel test by manually sending a cancel message
  const handlers = {
    test() {
      return "success";
    },
  };
  const exposedHandlers = expose(a, handlers);

  // Send a legacy cancel message with just 'id' (no idRef)
  a.postMessage({ id: "some-call-id", kind: "cancel" });

  // Send a cancel message with idRef as well
  a.postMessage({
    id: "cancel-msg-id",
    kind: "cancel",
    idRef: "some-other-call-id",
  });

  // Send a cancel with no id at all
  a.postMessage({ kind: "cancel" });

  // Regular functionality should still work
  const api = wrap<typeof handlers>(b, ["test"]);
  assertEquals(await api.test(), "success");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose cleanup after Object.defineProperty fails", async () => {
  const [a, b] = memoryPair();

  // Create handlers object that can't have properties defined
  const handlers = Object.freeze({
    test() {
      return "works";
    },
  });

  // This should still work despite defineProperty failing
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  assertEquals(await api.test(), "works");

  // The __endpoint_link_close should not exist due to defineProperty failure
  // deno-lint-ignore no-explicit-any
  assertEquals((exposedHandlers as any).__endpoint_link_close, undefined);

  // Cleanup
  api.close();
  closePorts(a, b);
});

Deno.test("RPC wrap handles malformed response messages", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Send malformed response messages - these should be ignored
  b.postMessage(null);
  b.postMessage(undefined);
  b.postMessage({});
  b.postMessage({ kind: "unknown" });
  b.postMessage({ kind: "result" }); // Missing id
  b.postMessage({ kind: "result", id: "nonexistent" }); // Unknown id

  // Regular call should still work
  assertEquals(await api.test(), "works");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC wrap abort signal event listener cleanup", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    slowTask(_ms: number, _signal?: AbortSignal): Promise<string> {
      return new Promise((resolve) => {
        setTimeout(() => resolve("done"), 10);
      });
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["slowTask"]);

  const controller = new AbortController();

  // Call with abort signal - should succeed and clean up listeners
  const result = await api.slowTask(10, controller.signal);
  assertEquals(result, "done");

  // Test that the listener was cleaned up by checking there are no lingering effects
  controller.abort(); // This should not affect anything since listener was cleaned up

  // Another call should work fine
  const result2 = await api.slowTask(10);
  assertEquals(result2, "done");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC wrap error during argument preparation", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test(_arg: string) {
      return "should not reach";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Create a promise that rejects
  const rejectingPromise = Promise.reject(new Error("promise failed"));

  // This should reject due to promise argument rejection
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    () => api.test(rejectingPromise as any),
    Error,
    "promise failed",
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

Deno.test("RPC wrap abort signal removeEventListener error handling", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Create a mock AbortSignal that throws when removeEventListener is called
  const mockSignal = {
    aborted: false,
    addEventListener(_type: string, _listener: () => void) {
      // Simulate successful add
    },
    removeEventListener() {
      throw new Error("removeEventListener failed");
    },
  };

  // This should succeed despite removeEventListener throwing
  // deno-lint-ignore no-explicit-any
  const result = await api.test(mockSignal as any);
  assertEquals(result, "success");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose handler aborted during execution", async () => {
  const [a, b] = memoryPair();

  const handlers = {
    taskThatThrowsAfterAbort(signal?: AbortSignal): Promise<string> {
      // Simulate a handler that manually checks and throws when aborted
      if (signal?.aborted) {
        throw new Error("already aborted");
      }

      // Simulate some async work
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          // Check abort status during execution
          if (signal?.aborted) {
            reject(new Error("aborted during execution"));
          } else {
            resolve("completed");
          }
        }, 10);
      });
    },
  };

  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["taskThatThrowsAfterAbort"]);

  // Create an already-aborted signal to force the aborted error path in expose's catch block
  const controller = new AbortController();
  controller.abort();

  // This should trigger the handler to throw, and then the expose catch block
  // should detect ac.signal.aborted = true and return "aborted" error
  await assertRejects(
    () => api.taskThatThrowsAfterAbort(controller.signal),
    Error,
    "aborted",
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

Deno.test("RPC wrap response with unknown reply ID", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Send a result message with an unknown ID - should be ignored
  b.postMessage({
    kind: "result",
    id: "unknown-id-12345",
    result: "should be ignored",
  });

  // Normal operation should still work
  assertEquals(await api.test(), "works");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose cancel with missing callId", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);

  // Send cancel message with no callId/idRef - should be handled gracefully
  a.postMessage({ kind: "cancel", id: "cancel-msg-id" }); // No idRef
  a.postMessage({ kind: "cancel" }); // No id or idRef

  const api = wrap<typeof handlers>(b, ["test"]);
  assertEquals(await api.test(), "works");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});
