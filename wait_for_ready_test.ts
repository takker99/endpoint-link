import { waitForReady } from "./wait_for_ready.ts";
import { signalReady } from "./signal_ready.ts";
import { assertRejects } from "@std/assert";
import { closePorts, memoryPair } from "./test_utils.ts";

Deno.test("waitForReady()", async (t) => {
  await t.step(
    "resolves when ready message received",
    async () => {
      const [a, b] = memoryPair();

      // Start waiting for ready
      const readyPromise = waitForReady(b);

      // Send ready message after a short delay
      setTimeout(() => signalReady(a), 10);

      // Should resolve without throwing
      await readyPromise;

      closePorts(a, b);
    },
  );

  await t.step("aborts when signal is aborted", async () => {
    const [a, b] = memoryPair();

    // Wait for ready with abort signal (timeout after 50ms)
    await assertRejects(
      () => waitForReady(b, AbortSignal.timeout(50)),
      Error,
      "aborted",
    );

    closePorts(a, b);
  });

  await t.step("rejects immediately if signal is already aborted", async () => {
    const [a, b] = memoryPair();

    // Create an already-aborted signal
    const controller = new AbortController();
    controller.abort();

    // Should reject immediately without waiting
    await assertRejects(
      () => waitForReady(b, controller.signal),
      Error,
      "aborted",
    );

    closePorts(a, b);
  });

  await t.step("ignores removeEventListener errors", async () => {
    // create a memory pair
    const [a, b] = memoryPair();

    // fake AbortSignal whose removeEventListener throws
    const fakeSignal = {
      aborted: false,
      // deno-lint-ignore no-explicit-any
      addEventListener: (_: string, __: any) => {},
      removeEventListener: () => {
        throw new Error("remove failed");
      },
    } as unknown as AbortSignal;

    const readyPromise = waitForReady(b, fakeSignal);

    // send ready
    a.postMessage({ kind: "ready" }, []);

    await readyPromise;

    closePorts(a, b);
  });
});
