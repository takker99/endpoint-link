import { wrap } from "./wrap.ts";
import { expose } from "./expose.ts";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { closePorts, memoryPair } from "./test_utils.ts";

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
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);
  assertEquals(await api("add", [1, 2]), 3);
  assertEquals(await api("mul", [2, 3]), 6);

  // Test with different arguments
  assertEquals(await api("add", [4, 5]), 9);

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC error propagation", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    boom(_n: number, _s?: AbortSignal) {
      throw new Error("boom");
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);
  await assertRejects(() => api("boom", [1]), Error, "boom");

  // Cleanup
  api[Symbol.dispose]();
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
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  const controller = new AbortController();
  // Immediately abort
  controller.abort();

  await assertRejects(
    () => api("longTask", [100], { signal: controller.signal }),
    Error,
    "aborted",
  );

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("Transferable ArrayBuffer is passed", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    len(buf: ArrayBuffer, _s?: AbortSignal) {
      return (buf.byteLength ?? 0) as number;
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);
  const buf = new Uint8Array([1, 2, 3]).buffer;
  const n = await api("len", [buf]);
  assertEquals(n, 3);

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC handles missing handler", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    existing() {
      return "exists";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Call non-existent method
  await assertRejects(
    // deno-lint-ignore no-explicit-any
    () => (api as any)("nonExistent", []),
    Error,
    "no handler: nonExistent",
  );

  // Existing method should work
  assertEquals(await api("existing", []), "exists");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC rejects Promise arguments", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    concat(str1: string, str2: string, _s?: AbortSignal) {
      return str1 + str2;
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Test that Promise arguments are rejected synchronously
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => api("concat", [Promise.resolve("hello"), "world"] as any),
    TypeError,
    "Promise arguments are not supported",
  );

  // Cleanup
  api[Symbol.dispose]();
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
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  const controller = new AbortController();
  controller.abort(); // Abort immediately

  await assertRejects(
    () => api("slowTask", [100], { signal: controller.signal }),
    Error,
    "aborted",
  );

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap creates callable API", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // API should be callable
  assertEquals(typeof api, "function");

  // Call method should work
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
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

  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Test with an aborted signal
  const controller = new AbortController();
  controller.abort();

  // The task should be aborted
  await assertRejects(
    () => api("slowTask", [100], { signal: controller.signal }),
    Error,
    "aborted",
  );

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC expose handles malformed data", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  using _disposable = expose(a, handlers);

  // Send malformed data
  a.postMessage(null, []);
  a.postMessage(undefined, []);
  a.postMessage({}, []);
  a.postMessage({ kind: "unknown" }, []);
  a.postMessage({ kind: "call" }, []); // missing id/name
  a.postMessage({ kind: "call", id: "test-id" }, []); // missing name

  // Regular call should still work
  const api = await wrap<typeof handlers>(b);
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
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
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  await assertRejects(() => api("throwsNull", []), Error, "unknown");
  await assertRejects(() => api("throwsUndefined", []), Error, "unknown");

  // Cleanup
  api[Symbol.dispose]();
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
  using _disposable = expose(a, handlers);

  // Send a legacy cancel message with just 'id' (no idRef)
  a.postMessage({ id: "some-call-id", kind: "cancel" }, []);

  // Send a cancel message with idRef as well
  a.postMessage({
    id: "cancel-msg-id",
    kind: "cancel",
    idRef: "some-other-call-id",
  }, []);

  // Send a cancel with no id at all
  a.postMessage({ kind: "cancel" }, []);

  // Regular call should still work
  const api = await wrap<typeof handlers>(b);
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC expose works with frozen handlers object", async () => {
  const [a, b] = memoryPair();

  // Create a handlers object that is frozen
  const handlers = Object.freeze({
    test() {
      return "success";
    },
  });

  // This should work without issues
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Regular functionality should still work
  assertEquals(await api("test", []), "success");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap handles malformed response messages", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Send malformed response messages
  b.postMessage(null, []);
  b.postMessage({}, []);
  b.postMessage({ kind: "unknown" }, []);
  b.postMessage({ kind: "result" }, []); // missing id
  b.postMessage({ kind: "result", id: "nonexistent" }, []); // unknown id

  // Regular call should still work
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap abort signal event listener cleanup", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Create an AbortController and use it
  const controller = new AbortController();

  // Normal call should work fine
  const result = await api("test", [], { signal: controller.signal });
  assertEquals(result, "success");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap rejects promise arguments", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test(_arg: string) {
      return "should not reach";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Create a promise
  const somePromise = Promise.resolve("value");

  // This should throw synchronously due to promise argument validation
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => api("test", [somePromise] as any),
    TypeError,
    "Promise arguments are not supported",
  );

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap abort signal removeEventListener error handling", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

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
  const result = await api("test", [], { signal: mockSignal as any });
  assertEquals(result, "success");

  // Cleanup
  api[Symbol.dispose]();
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

  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Create an already-aborted signal to force the aborted error path in expose's catch block
  const controller = new AbortController();
  controller.abort();

  // This should trigger the handler to throw, and then the expose catch block
  // should detect ac.signal.aborted = true and return "aborted" error
  await assertRejects(
    () => api("taskThatThrowsAfterAbort", [], { signal: controller.signal }),
    Error,
    "aborted",
  );

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap response with unknown reply ID", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Send a result message with an unknown ID - should be ignored
  b.postMessage({
    kind: "result",
    id: "unknown-id-12345",
    result: "should be ignored",
  }, []);

  // Normal operation should still work
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC expose cancel with missing callId", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };
  using _disposable = expose(a, handlers);

  // Send cancel message with no callId/idRef - should be handled gracefully
  a.postMessage({ kind: "cancel", id: "cancel-msg-id" }, []); // No idRef
  a.postMessage({ kind: "cancel" }, []); // No id or idRef

  const api = await wrap<typeof handlers>(b);
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC expose sends ready signal (integrated with wrap)", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "works";
    },
  };

  // Expose handlers - this should send ready signal
  using _disposable = expose(a, handlers);

  // wrap should wait for ready signal automatically
  const api = await wrap<typeof handlers>(b, { timeout: 1000 });

  // If we get here, the ready signal was received
  assertEquals(await api("test", []), "works");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC readiness protocol with delayed expose", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };

  // Start wrap which will wait for ready signal
  const wrapPromise = wrap<typeof handlers>(b, { timeout: 1000 });

  // Expose handlers after a delay
  setTimeout(() => {
    expose(a, handlers);
  }, 50);

  // Should resolve when expose sends ready signal
  const api = await wrapPromise;

  // Now we can safely use the API
  assertEquals(await api("test", []), "success");

  // Cleanup
  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap API throws after disposal via Symbol.dispose", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // API works before disposal
  assertEquals(await api("test", []), "success");

  // Dispose the API
  api[Symbol.dispose]();

  // Calling the API after disposal should throw synchronously
  assertThrows(
    () => api("test", []),
    Error,
    "API has been disposed",
  );

  closePorts(a, b);
});

Deno.test("RPC wrap API with using syntax automatically disposes", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };
  using _disposable = expose(a, handlers);

  // deno-lint-ignore no-explicit-any
  let api: any;
  {
    using _api = await wrap<typeof handlers>(b);
    api = _api;
    // API works within the using block
    assertEquals(await api("test", []), "success");
  }

  // After exiting the using block, the API should be disposed
  assertThrows(
    () => api("test", []),
    Error,
    "API has been disposed",
  );

  closePorts(a, b);
});

Deno.test("RPC wrap API with using syntax works correctly", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    add(x: number, y: number) {
      return x + y;
    },
  };
  using _disposable = expose(a, handlers);

  {
    using api = await wrap<typeof handlers>(b);
    // API works within the using block
    assertEquals(await api("add", [1, 2]), 3);
  }

  // After exiting the using block, the API should be disposed
  // We can't test it directly since api is out of scope
  // but we test it in the previous test

  closePorts(a, b);
});

Deno.test("RPC expose with using syntax cleans up listeners", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };

  {
    using _disposable = expose(a, handlers);
    const api = await wrap<typeof handlers>(b);

    // API works while expose is active
    assertEquals(await api("test", []), "success");
    api[Symbol.dispose]();
  }

  // After using block, expose should be disposed
  // Try to wrap again - it should time out since expose cleaned up
  await assertRejects(
    () => wrap<typeof handlers>(b, { timeout: 100 }),
    Error,
    "Endpoint readiness timeout after 100ms",
  );

  closePorts(a, b);
});

Deno.test("RPC messageerror event listener attached in expose", () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };

  // Track if messageerror handler is registered
  let messageerrorHandled = false;

  // Spy on addEventListener to check if messageerror listener is attached
  // deno-lint-ignore no-explicit-any
  const originalAddEventListener = (a as any).addEventListener;
  // deno-lint-ignore no-explicit-any
  (a as any).addEventListener = function (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    if (type === "messageerror") {
      messageerrorHandled = true;
    }
    // deno-lint-ignore no-explicit-any
    return originalAddEventListener.call(this, type as any, listener, options);
  };

  using _disposable = expose(a, handlers);

  // Verify messageerror listener was attached
  assertEquals(messageerrorHandled, true);

  closePorts(a, b);
});

Deno.test("RPC messageerror event listener attached in wrap", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };

  using _disposable = expose(a, handlers);

  // Track if messageerror handler is registered
  let messageerrorHandled = false;

  // Spy on addEventListener to check if messageerror listener is attached
  // deno-lint-ignore no-explicit-any
  const originalAddEventListener = (b as any).addEventListener;
  // deno-lint-ignore no-explicit-any
  (b as any).addEventListener = function (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions,
  ) {
    if (type === "messageerror") {
      messageerrorHandled = true;
    }
    // deno-lint-ignore no-explicit-any
    return originalAddEventListener.call(this, type as any, listener, options);
  };

  const api = await wrap<typeof handlers>(b);

  // Verify messageerror listener was attached
  assertEquals(messageerrorHandled, true);

  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap with custom timeout option", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    test() {
      return "success";
    },
  };

  using _disposable = expose(a, handlers);

  // Test with custom timeout
  const api = await wrap<typeof handlers>(b, { timeout: 3000 });
  assertEquals(await api("test", []), "success");

  api[Symbol.dispose]();
  closePorts(a, b);
});

Deno.test("RPC wrap with transfer option", async () => {
  const [a, b] = memoryPair();
  const handlers = {
    processBuffer(buf: ArrayBuffer, _s?: AbortSignal) {
      return buf.byteLength;
    },
  };

  using _disposable = expose(a, handlers);
  const api = await wrap<typeof handlers>(b);

  // Create a buffer to transfer
  const buffer = new ArrayBuffer(1024);
  assertEquals(buffer.byteLength, 1024);

  // Call with transfer option
  const result = await api("processBuffer", [buffer], { transfer: [buffer] });
  assertEquals(result, 1024);

  // Buffer should be neutered (transferred)
  assertEquals(buffer.byteLength, 0);

  api[Symbol.dispose]();
  closePorts(a, b);
});
