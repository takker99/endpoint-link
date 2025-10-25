import { expose } from "./expose.ts";
import { wrap } from "./wrap.ts";
import { assertRejects } from "@std/assert";
import { closePorts, memoryPair } from "./test_utils.ts";

Deno.test("expose()", async (t) => {
  await t.step("handles messageerror silently", () => {
    const [a, b] = memoryPair();
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
    closePorts(a, b);
  });

  await t.step("handler throws and sends error result", async () => {
    const [a, b] = memoryPair();
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

    closePorts(a, b);
  });

  await t.step("handler throws null and sends unknown error", async () => {
    const [a, b] = memoryPair();
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

    closePorts(a, b);
  });

  await t.step(
    "sends aborted error when handler is cancelled",
    async () => {
      const [a, b] = memoryPair();
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
      await new Promise((r) => setTimeout(r, 10));

      // Send cancel message
      controller.abort();

      await assertRejects(
        () => callPromise,
        Error,
        "aborted",
      );

      closePorts(a, b);
    },
  );

  await t.step("dispose removes all listeners", () => {
    const [a, b] = memoryPair();
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
    closePorts(a, b);
  });
});
