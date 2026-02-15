import type { CancelMsg, Msg, ResultMsg } from "./protocol.ts";
import type { Endpoint } from "./shared_types.ts";
import type {
  ExposeDisposable,
  ExposeOptions,
  RemoteProcedureMap,
} from "./types.ts";
import { signalReady } from "./signal_ready.ts";
import { on, onMessageError } from "./on.ts";

/**
 * Register handlers on an endpoint and return a Disposable for cleanup.
 * Sets up message handling for RPC calls and signals readiness.
 *
 * @param endpoint The endpoint to register handlers on.
 * @param handlers Map of handler functions to expose.
 * @param options Configuration options.
 * @returns A Disposable object for resource cleanup with `using` syntax.
 */

export const expose = <H extends RemoteProcedureMap>(
  endpoint: Endpoint,
  handlers: H,
  options?: ExposeOptions,
): ExposeDisposable => {
  const controllerMap = new Map<string, AbortController>();

  const remove = on(endpoint, async (data: Msg) => {
    if (!data) return;
    if (data.kind === "call") {
      const { id, name, args = [] } = data;
      // deno-lint-ignore no-explicit-any
      const h = (handlers as any)[name];
      if (!h) {
        endpoint.postMessage(
          { id, kind: "result", error: `no handler: ${name}` } as ResultMsg,
          [],
        );
        return;
      }

      const ac = new AbortController();
      controllerMap.set(id, ac);

      try {
        // deno-lint-ignore no-explicit-any
        const res = await (h as any)(...args, ac.signal);
        endpoint.postMessage(
          { id, kind: "result", result: res } as ResultMsg,
          [],
        );
      } catch (e) {
        if (ac.signal.aborted) {
          endpoint.postMessage(
            { id, kind: "result", error: "aborted" } as ResultMsg,
            [],
          );
        } else {
          endpoint.postMessage(
            { id, kind: "result", error: String(e || "unknown") } as ResultMsg,
            [],
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

  // Handle messageerror events (when message cannot be deserialized)
  const removeMessageError = onMessageError(
    endpoint,
    options?.onMessageError ??
      ((ev: MessageEvent) => {
        console.error("Message deserialization error:", ev);
      }),
  );

  // Signal that this endpoint is ready to receive messages
  signalReady(endpoint);

  return {
    [Symbol.dispose]: () => {
      remove();
      removeMessageError();
      controllerMap.clear();
    },
  };
};
