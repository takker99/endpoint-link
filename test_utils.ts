import type { Endpoint } from "./shared_types.ts";

/**
 * Helper: make an in-memory Endpoint using {@linkcode MessageChannel}
 *
 * @internal
 */
export const memoryPair = ():
  & { port1: Endpoint; port2: Endpoint }
  & Disposable => {
  const mc = new MessageChannel();

  // Both ports are Endpoint-like; start them to ensure message delivery
  // deno-lint-ignore no-explicit-any
  const port1 = mc.port1 as any as Endpoint;
  // deno-lint-ignore no-explicit-any
  const port2 = mc.port2 as any as Endpoint;

  // Start ports to ensure message delivery
  port1?.start?.();
  port2?.start?.();

  const pair: { port1: Endpoint; port2: Endpoint } & Disposable = {
    port1,
    port2,
    [Symbol.dispose]: () => {
      // deno-lint-ignore no-explicit-any
      (port1 as any)?.close?.();
      // deno-lint-ignore no-explicit-any
      (port2 as any)?.close?.();
    },
  };
  return pair;
};
