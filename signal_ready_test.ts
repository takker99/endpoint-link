import { assertEquals } from "@std/assert/equals";
import { signalReady } from "./signal_ready.ts";
import { closePorts, memoryPair } from "./test_utils.ts";

Deno.test("signalReady()", async () => {
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
