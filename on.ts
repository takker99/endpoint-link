import type { Endpoint } from "./shared_types.ts";

/**
 * Attach message listener to an endpoint and return a cleanup function.
 * @internal
 * @param endpoint The endpoint to attach the listener to.
 * @param handler The handler function to call on message events.
 * @returns A function to remove the listener.
 */
// deno-lint-ignore no-explicit-any
export const on = (endpoint: Endpoint, handler: (data: any) => void) => {
  const controller = new AbortController();
  // deno-lint-ignore no-explicit-any
  endpoint.addEventListener("message", (ev: any) => handler(ev.data), {
    signal: controller.signal,
  });
  return controller.abort.bind(controller);
};

/**
 * Attach messageerror listener to an endpoint and return a cleanup function.
 * Called when a message cannot be deserialized.
 * @internal
 * @param endpoint The endpoint to attach the listener to.
 * @param handler The handler function to call on messageerror events.
 * @returns A function to remove the listener.
 */
export const onMessageError = (
  endpoint: Endpoint,
  handler: (ev: MessageEvent) => void,
) => {
  const controller = new AbortController();
  // deno-lint-ignore no-explicit-any
  endpoint.addEventListener("messageerror", (ev: any) => handler(ev), {
    signal: controller.signal,
  });
  return controller.abort.bind(controller);
};
