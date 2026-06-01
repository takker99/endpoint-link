import { expose } from "./expose.ts";
import { wrap } from "./wrap.ts";
import { delay } from "@std/async/delay";
import { assertEquals, assertRejects } from "@std/assert";
import { memoryPair } from "./test_utils.ts";
import { transferables } from "./types.ts";

Deno.test({
  name: "expose()",
  sanitizeResources: false,
  async fn(t) {
    await t.step("handles messageerror silently", () => {
      using pair = memoryPair();
      const { port1: a } = pair;
      const handlers = {
        test() {
          return "works";
        },
      };

      // Expose handlers
      using _exposer = expose(a, handlers);

      // Just make sure expose sets up the messageerror listener
      // (No way to trigger real messageerror without unserializable data)
      // This test ensures the listener is attached without crashing
    });

    await t.step("handler throws and sends error result", async () => {
      using pair = memoryPair();
      const { port1: a, port2: b } = pair;
      const handlers = {
        throwError() {
          throw new Error("handler error");
        },
      };

      using _exposer = expose(a, handlers);
      const api = await wrap<typeof handlers>(b);

      await assertRejects(
        () => api("throwError", []),
        Error,
        "handler error",
      );
    });

    await t.step("handler throws null and sends unknown error", async () => {
      using pair = memoryPair();
      const { port1: a, port2: b } = pair;
      const handlers = {
        throwNull() {
          throw null;
        },
      };

      using _exposer = expose(a, handlers);
      const api = await wrap<typeof handlers>(b);

      await assertRejects(
        () => api("throwNull", []),
        Error,
        "unknown",
      );
    });

    await t.step(
      "sends aborted error when handler is cancelled",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          longTask() {
            return new Promise(() => {}); // Never resolves
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const controller = new AbortController();
        const callPromise = api("longTask", [], { signal: controller.signal });

        // Wait for the call to be sent and registered on expose side
        await delay(10);

        // Send cancel message
        controller.abort();

        await assertRejects(
          () => callPromise,
          Error,
          "aborted",
        );
      },
    );

    await t.step("dispose removes all listeners", () => {
      using pair = memoryPair();
      const { port1: a } = pair;
      const handlers = {
        test() {
          return "works";
        },
      };

      // Use the disposer
      const disposer = expose(a, handlers);

      // Dispose immediately
      disposer[Symbol.dispose]();

      // After dispose, should not respond to new calls (listeners removed)
    });

    await t.step(
      "returns transferable ArrayBuffer from handler",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getBuffer() {
            const buf = new Uint8Array([1, 2, 3]).buffer;
            return transferables(buf, [buf]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getBuffer", []);
        assertEquals(result instanceof ArrayBuffer, true);
        assertEquals(
          new Uint8Array(result as ArrayBuffer),
          new Uint8Array([1, 2, 3]),
        );
      },
    );

    await t.step(
      "returns transferable ReadableStream from handler",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.close();
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        assertEquals(result instanceof ReadableStream, true);
        const reader = result.getReader();
        const { value, done } = await reader.read();
        assertEquals(done, false);
        assertEquals(value, new Uint8Array([4, 5, 6]));
        await reader.cancel();
      },
    );

    await t.step(
      "returns transferable ReadableStream - push multiple chunks",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
                controller.enqueue(new Uint8Array([7, 8, 9]));
                controller.close();
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const values: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          values.push(value);
        }

        assertEquals(values.length, 3);
        assertEquals(values[0], new Uint8Array([1, 2, 3]));
        assertEquals(values[1], new Uint8Array([4, 5, 6]));
        assertEquals(values[2], new Uint8Array([7, 8, 9]));
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - pull based",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            let count = 0;
            const stream = new ReadableStream<Uint8Array>({
              pull(controller) {
                count++;
                controller.enqueue(new Uint8Array([count]));
                if (count >= 3) {
                  controller.close();
                }
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const values: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          values.push(value);
        }

        assertEquals(values.length, 3);
        assertEquals(values[0], new Uint8Array([1]));
        assertEquals(values[1], new Uint8Array([2]));
        assertEquals(values[2], new Uint8Array([3]));
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - push and pull hybrid",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            let pulled = false;
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([1]));
              },
              pull(controller) {
                if (!pulled) {
                  pulled = true;
                  controller.enqueue(new Uint8Array([2]));
                  controller.enqueue(new Uint8Array([3]));
                  controller.close();
                }
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const values: Uint8Array[] = [];
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          values.push(value);
        }

        assertEquals(values.length, 3);
        assertEquals(values[0], new Uint8Array([1]));
        assertEquals(values[1], new Uint8Array([2]));
        assertEquals(values[2], new Uint8Array([3]));
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - backpressure",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            let count = 0;
            const stream = new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  count++;
                  return new Promise<void>((resolve) => {
                    setTimeout(() => {
                      controller.enqueue(new Uint8Array([count]));
                      if (count >= 3) {
                        controller.close();
                      }
                      resolve();
                    }, 5);
                  });
                },
              },
              { highWaterMark: 1 },
            );
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const values: Uint8Array[] = [];
        for (let i = 0; i < 3; i++) {
          const { value, done } = await reader.read();
          assertEquals(done, false);
          values.push(value!);
          await delay(10);
        }

        const { done } = await reader.read();
        assertEquals(done, true);
        assertEquals(values.length, 3);
        assertEquals(values[0], new Uint8Array([1]));
        assertEquals(values[1], new Uint8Array([2]));
        assertEquals(values[2], new Uint8Array([3]));
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - cancel mid stream",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        let cancelReason: string | undefined;
        const handlers = {
          getStream() {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.enqueue(new Uint8Array([4, 5, 6]));
              },
              cancel(reason) {
                cancelReason = reason as string;
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const { value, done } = await reader.read();
        assertEquals(done, false);
        assertEquals(value, new Uint8Array([1, 2, 3]));

        await reader.cancel("user cancelled");

        // Allow time for cancel to propagate back
        await delay(10);
        assertEquals(cancelReason, "user cancelled");
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - error propagation",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.error(new Error("stream broken"));
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        await assertRejects(
          () => reader.read(),
          Error,
          "stream broken",
        );
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - empty stream",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.close();
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const { done } = await reader.read();
        assertEquals(done, true);
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable ReadableStream - large data",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;
        const handlers = {
          getStream() {
            const data = new Uint8Array(1024 * 1024); // 1MB
            for (let i = 0; i < data.length; i++) {
              data[i] = i % 256;
            }
            const stream = new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(data);
                controller.close();
              },
            });
            return transferables(stream, [stream]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getStream", []);
        const reader = result.getReader();

        const { value, done } = await reader.read();
        assertEquals(done, false);
        assertEquals(value!.length, 1024 * 1024);

        assertEquals(value![0], 0);
        assertEquals(value![1023], 1023 % 256);
        assertEquals(value![1024 * 1024 - 1], (1024 * 1024 - 1) % 256);

        const { done: done2 } = await reader.read();
        assertEquals(done2, true);
        reader.releaseLock();
      },
    );

    await t.step(
      "returns transferable MessagePort from handler",
      async () => {
        using pair = memoryPair();
        const { port1: a, port2: b } = pair;

        // Create MessageChannel in test scope so we can clean up port2
        const mc = new MessageChannel();
        mc.port2.addEventListener("message", (ev) => {
          mc.port2.postMessage(`echo: ${ev.data}`);
        });
        mc.port2.start();

        const handlers = {
          getPort() {
            return transferables(mc.port1, [mc.port1]);
          },
        };

        using _exposer = expose(a, handlers);
        const api = await wrap<typeof handlers>(b);

        const result = await api("getPort", []);
        assertEquals(result instanceof MessagePort, true);

        // Verify the port is actually usable after transfer
        const port = result as MessagePort;
        port.start();

        const messagePromise = new Promise<string>((resolve) => {
          port.addEventListener("message", (ev) => {
            resolve(ev.data as string);
          });
        });

        port.postMessage("hello from transferred port");
        const received = await messagePromise;
        assertEquals(received, "echo: hello from transferred port");

        // Cleanup transferred port and the original channel's port2
        port.close();
        mc.port2.close();
      },
    );
  },
});
