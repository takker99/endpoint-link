import type { Endpoint } from "./shared_types.ts";

// attach message listener; returns a remover.
// deno-lint-ignore no-explicit-any
export const on = (endpoint: Endpoint, handler: (data: any) => void) => {
  const controller = new AbortController();
  // deno-lint-ignore no-explicit-any
  endpoint.addEventListener("message", (ev: any) => handler(ev.data), {
    signal: controller.signal,
  });
  return controller.abort.bind(controller);
};
