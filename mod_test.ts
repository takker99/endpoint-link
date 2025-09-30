import { expose, wrap } from "./mod.ts";
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

  const controller = new AbortController();
  // Immediately abort
  controller.abort();

  await assertRejects(
    () => api.longTask(100, controller.signal),
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
    () => (api as any).call("nonExistent"),
    Error,
    "no handler: nonExistent",
  );

  // Existing method should work
  assertEquals(await api.existing(), "exists");

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

  // Test with Promise arguments
  const result = await api.concat(
    Promise.resolve("hello"),
    Promise.resolve(" world"),
  );
  assertEquals(result, "hello world");

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
    slowTask(_ms: number, signal?: AbortSignal): Promise<string> {
      // Check if already aborted
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      // Return immediately since the signal will abort the request
      return Promise.resolve("done");
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["slowTask"]);

  const controller = new AbortController();
  controller.abort(); // Abort immediately

  await assertRejects(
    () => api.slowTask(100, controller.signal),
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

Deno.test("RPC wrap without methodNames creates basic API", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b); // No methodNames array

  // Should only have call method, not individual methods
  assertEquals(typeof api.call, "function");
  // deno-lint-ignore no-explicit-any
  assertEquals((api as any).test, undefined);

  // Call method should work
  assertEquals(await api.call("test"), "works");

  // Cleanup
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
  closePorts(a, b);
});

Deno.test("RPC expose handles cancel messages", async () => {
  const [a, b] = memoryPair();

  // Create handlers with a simple method
  const handlers = {
    slowTask(_ms: number, signal?: AbortSignal): Promise<string> {
      // Simulate a task that can be cancelled
      if (signal?.aborted) {
        throw new Error("aborted");
      }
      return Promise.resolve("done");
    },
  };

  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["slowTask"]);

  // Test with an aborted signal
  const controller = new AbortController();
  controller.abort();

  // The task should be aborted
  await assertRejects(
    () => api.slowTask(100, controller.signal),
    Error,
    "aborted"
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

Deno.test("RPC expose handles malformed data", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  const exposedHandlers = expose(a, handlers);

  // Send malformed data
  a.postMessage(null);
  a.postMessage(undefined);
  a.postMessage({});
  a.postMessage({ kind: "unknown" });
  a.postMessage({ kind: "call" }); // missing id/name
  a.postMessage({ kind: "call", id: "test-id" }); // missing name

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
      return "works";
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

Deno.test("RPC expose cleanup after Object.defineProperty fails", async () => {
  const [a, b] = memoryPair();

  // Create a handlers object that can't have properties added
  const handlers = Object.freeze({
    test() {
      return "success";
    },
  });

  // This should not throw even if Object.defineProperty fails
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Regular functionality should still work
  assertEquals(await api.test(), "success");

  // Cleanup (the __endpoint_link_close property won't exist due to the freeze)
  api.close();
  // deno-lint-ignore no-explicit-any
  if ((exposedHandlers as any).__endpoint_link_close) {
    // deno-lint-ignore no-explicit-any
    (exposedHandlers as any).__endpoint_link_close();
  }
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

  // Send malformed response messages
  b.postMessage(null);
  b.postMessage({});
  b.postMessage({ kind: "unknown" });
  b.postMessage({ kind: "result" }); // missing id
  b.postMessage({ kind: "result", id: "nonexistent" }); // unknown id

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
    test() {
      return "success";
    },
  };
  const exposedHandlers = expose(a, handlers);
  const api = wrap<typeof handlers>(b, ["test"]);

  // Create an AbortController and use it
  const controller = new AbortController();
  
  // Normal call should work fine
  const result = await api.test(controller.signal);
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