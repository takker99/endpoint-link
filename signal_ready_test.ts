import { assertEquals } from "@std/assert/equals";
import { signalReady } from "./signal_ready.ts";
import { memoryPair } from "./test_utils.ts";

Deno.test("signalReady()", async () => {
  using pair = memoryPair();
  const { port1: a, port2: b } = pair;

  let resolveReceivedMessage:
    | ((value: { kind?: string } | undefined) => void)
    | undefined;
  const receivedMessagePromise = new Promise<{ kind?: string } | undefined>(
    (resolve) => {
      resolveReceivedMessage = resolve;
    },
  );
  const cleanup = (() => {
    const controller = new AbortController();
    // deno-lint-ignore no-explicit-any
    const handler = (ev: any) => resolveReceivedMessage?.(ev.data);
    b.addEventListener("message", handler, { signal: controller.signal });
    return controller.abort.bind(controller);
  })();

  signalReady(a);
  const receivedMessage = await receivedMessagePromise;

  assertEquals(receivedMessage?.kind, "ready");

  cleanup();
});
