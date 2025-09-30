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
      const readyPromise = waitForReady(b, 1000);

      // Send ready message after a short delay
      setTimeout(() => signalReady(a), 10);

      // Should resolve without throwing
      await readyPromise;

      closePorts(a, b);
    },
  );

  await t.step("times out when no ready message", async () => {
    const [a, b] = memoryPair();

    // Wait for ready with a very short timeout
    await assertRejects(
      () => waitForReady(b, 50),
      Error,
      "Endpoint readiness timeout after 50ms",
    );

    closePorts(a, b);
  });
});
