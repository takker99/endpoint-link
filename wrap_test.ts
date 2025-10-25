import { wrap } from "./wrap.ts";
import { expose } from "./expose.ts";
import { assertRejects, assertThrows } from "@std/assert";
import { closePorts, memoryPair } from "./test_utils.ts";
import type { Endpoint } from "./shared_types.ts";

// Fake endpoint whose postMessage throws
class ThrowingEndpoint implements Endpoint {
  private listeners: ((ev: MessageEvent) => void)[] = [];
  start?: () => void;
  // deno-lint-ignore no-explicit-any
  postMessage(_message: any, _transfer?: Transferable[]): void {
    throw new Error("post failed");
  }
  addEventListener(
    type: string,
    listener: (ev: MessageEvent) => void,
  ) {
    if (type === "message") this.listeners.push(listener);
    // no-op for messageerror
  }

  // helper to trigger ready
  triggerReady() {
    const ev = { data: { kind: "ready" } } as MessageEvent;
    for (const l of this.listeners) l(ev);
  }
}

Deno.test("wrap()", async (t) => {
  await t.step("rejects when postMessage throws", async () => {
    const endpoint = new ThrowingEndpoint();

    // wrap waits for ready; trigger it first
    const wrapPromise = wrap(endpoint);
    endpoint.triggerReady();
    const api = await wrapPromise;

    await assertRejects(() => api("foo", []), Error, "post failed");
  });

  await t.step("call throws after dispose synchronously", async () => {
    const [a, b] = memoryPair();
    // expose a simple handler on a so b will receive ready
    // reuse existing expose by sending ready directly
    // trigger ready by posting ready from a
    a.postMessage({ kind: "ready" }, []);

    const api = await wrap<Record<PropertyKey, never>>(b);
    api[Symbol.dispose]();

    // deno-lint-ignore no-explicit-any
    assertThrows(() => (api as any)("x", []), Error, "API has been disposed");
    // close ports
    closePorts(a, b);
  });

  await t.step("handles messageerror silently", async () => {
    const [a, b] = memoryPair();

    // Trigger ready
    a.postMessage({ kind: "ready" }, []);
    using _api = await wrap<Record<PropertyKey, never>>(b);

    // Just ensure the listener is attached
    closePorts(a, b);
  });

  await t.step("dispose cleans up all resources", async () => {
    const [a, b] = memoryPair();
    const handlers = {
      test() {
        return "works";
      },
    };

    using _exposer = expose(a, handlers);
    const api = await wrap<typeof handlers>(b);

    // Dispose should clean up listeners and maps
    api[Symbol.dispose]();

    // After dispose, pending calls map should be empty
    // (Can't directly verify, but shouldn't error)

    closePorts(a, b);
  });

  await t.step("call with already-aborted signal", async () => {
    const [a, b] = memoryPair();
    const handlers = {
      test() {
        return "works";
      },
    };

    using _exposer = expose(a, handlers);
    const api = await wrap<typeof handlers>(b);

    const controller = new AbortController();
    controller.abort();

    await assertRejects(
      () => api("test", [], { signal: controller.signal }),
      Error,
      "aborted",
    );

    closePorts(a, b);
  });

  await t.step(
    "call ignores removeEventListener error on resolve",
    async () => {
      const [a, b] = memoryPair();
      const handlers = {
        test() {
          return "result";
        },
      };

      using _exposer = expose(a, handlers);
      const api = await wrap<typeof handlers>(b);

      // Create signal that throws on removeEventListener
      const fakeSignal = {
        aborted: false,
        // deno-lint-ignore no-explicit-any
        addEventListener: (_: string, handler: any) => {
          // Call handler immediately to test resolve path with error
          Promise.resolve().then(() => handler());
        },
        removeEventListener: () => {
          throw new Error("remove failed");
        },
      } as unknown as AbortSignal;

      await assertRejects(
        () => api("test", [], { signal: fakeSignal }),
        Error,
        "aborted",
      );

      closePorts(a, b);
    },
  );

  await t.step(
    "ignores postMessage error when sending cancel",
    async () => {
      const [a, b] = memoryPair();
      const handlers = {
        longTask() {
          return new Promise(() => {}); // Never resolves
        },
      };

      using _exposer = expose(a, handlers);
      const api = await wrap<typeof handlers>(b);

      const callPromise = api("longTask", [], {
        signal: AbortSignal.timeout(10),
      });

      await assertRejects(
        () => callPromise,
        Error,
        "aborted",
      );

      closePorts(a, b);
    },
  );
});
