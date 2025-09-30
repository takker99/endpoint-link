import type { CancelMsg, Msg, ResultMsg } from "./protocol.ts";
import type { Endpoint } from "./shared_types.ts";
import type { HandlerMap } from "./types.ts";
import { signalReady } from "./signal_ready.ts";
import { on } from "./on.ts";
import { post } from "./post.ts";

/**
 * Register handlers on an endpoint and return them for typeof inference.
 * Sets up message handling for RPC calls and signals readiness.
 *
 * @param endpoint The endpoint to register handlers on.
 * @param handlers Map of handler functions to expose.
 * @returns The same handlers object for typeof inference.
 */

export const expose = <H extends HandlerMap>(
  endpoint: Endpoint,
  handlers: H,
): H => {
  const controllerMap = new Map<string, AbortController>();

  const remove = on(endpoint, async (data: Msg) => {
    if (!data) return;
    if (data.kind === "call") {
      const { id, name, args = [] } = data;
      // deno-lint-ignore no-explicit-any
      const h = (handlers as any)[name];
      if (!h) {
        post(
          endpoint,
          { id, kind: "result", error: `no handler: ${name}` } as ResultMsg,
        );
        return;
      }

      const ac = new AbortController();
      controllerMap.set(id, ac);

      try {
        // deno-lint-ignore no-explicit-any
        const res = await (h as any)(...args, ac.signal);
        post(endpoint, { id, kind: "result", result: res } as ResultMsg);
      } catch (e) {
        if (ac.signal.aborted) {
          post(endpoint, { id, kind: "result", error: "aborted" } as ResultMsg);
        } else {
          post(
            endpoint,
            { id, kind: "result", error: String(e || "unknown") } as ResultMsg,
          );
        }
      } finally {
        controllerMap.delete(id);
      }
    } else if (data.kind === "cancel") {
      // cancel invocation: abort controller if exists
      // deno-lint-ignore no-explicit-any
      const callId = (data as CancelMsg).idRef ?? (data as any).id;
      if (callId) {
        const ac = controllerMap.get(callId);
        if (ac) {
          ac.abort();
          controllerMap.delete(callId);
        }
      }
    }
  });

  // non-enumerable internal close for potential cleanup if needed later
  try {
    Object.defineProperty(handlers, "__endpoint_link_close", {
      value: () => {
        remove();
        controllerMap.clear();
      },
      configurable: true,
      enumerable: false,
    });
    // deno-lint-ignore no-empty
  } catch {}

  // Signal that this endpoint is ready to receive messages
  signalReady(endpoint);

  return handlers;
};
