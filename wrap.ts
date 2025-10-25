import type { CallMsg, CancelMsg, Msg } from "./protocol.ts";
import type { Endpoint } from "./shared_types.ts";
import type {
  RemoteProcedure,
  RemoteProcedureMap,
  RemoteProcedureOptions,
  WrapOptions,
} from "./types.ts";
import { waitForReady } from "./wait_for_ready.ts";
import { genId } from "./gen_id.ts";
import { on, onMessageError } from "./on.ts";

/**
 * Create a typed remote procedure caller from an endpoint.
 * Waits for endpoint readiness before returning.
 *
 * @param endpoint The endpoint to communicate through
 * @param options Configuration options
 * @returns Promise resolving to a remote procedure caller
 *
 * @example
 * ```ts ignore
 * const controller = new AbortController();
 * const timeout = setTimeout(() => controller.abort(), 5000);
 * try {
 *   using api = await wrap<MyAPI>(endpoint, { signal: controller.signal });
 *   const result = await api("methodName", [arg1, arg2], { signal });
 * } finally {
 *   clearTimeout(timeout);
 * }
 * ```
 */
export const wrap = async <Map extends RemoteProcedureMap>(
  endpoint: Endpoint,
  options?: WrapOptions,
): Promise<RemoteProcedure<Map>> => {
  const { signal } = options ?? {};

  // Wait for endpoint to be ready
  await waitForReady(endpoint, signal);

  const pendingCalls = new Map<
    string,
    // deno-lint-ignore no-explicit-any
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();

  let disposed = false;

  // Handle result messages
  const cleanupMessageListener = on(endpoint, (data: Msg) => {
    if (!data || data.kind !== "result") return;

    // deno-lint-ignore no-explicit-any
    const { id, error, result } = data as any;
    const pending = pendingCalls.get(id);
    if (!pending) return;

    pendingCalls.delete(id);

    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  });

  // Handle deserialization errors
  const cleanupErrorListener = onMessageError(endpoint, (ev: MessageEvent) => {
    console.error("Message deserialization error:", ev);
  });

  // Main call function
  const call = <Name extends keyof Map>(
    name: Name,
    args: Parameters<Map[Name]>,
    options?: RemoteProcedureOptions,
    // deno-lint-ignore no-explicit-any
  ): any => {
    if (disposed) {
      throw new Error("API has been disposed");
    }

    // Validate arguments don't contain Promises
    for (const arg of args) {
      if (arg && typeof arg.then === "function") {
        throw new TypeError(
          "Promise arguments are not supported. Await promises before passing them as arguments.",
        );
      }
    }

    const id = genId();
    const { transfer, signal } = options ?? {};

    return new Promise((resolve, reject) => {
      // Check if already aborted
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }

      // Store pending call
      pendingCalls.set(id, { resolve, reject });

      // Setup abort handling
      let abortHandler: (() => void) | undefined;
      if (signal) {
        abortHandler = () => {
          const pending = pendingCalls.get(id);
          if (pending) {
            pendingCalls.delete(id);
            pending.reject(new Error("aborted"));

            // Send cancel message
            try {
              endpoint.postMessage(
                { id, kind: "cancel", idRef: id } as CancelMsg,
                [],
              );
            } catch {
              // Ignore errors sending cancel
            }
          }
        };

        signal.addEventListener("abort", abortHandler, { once: true });

        // Wrap resolve/reject to cleanup listener
        const originalResolve = resolve;
        const originalReject = reject;

        // deno-lint-ignore no-explicit-any
        resolve = (value: any) => {
          try {
            signal.removeEventListener("abort", abortHandler!);
          } catch {
            // Ignore cleanup errors
          }
          originalResolve(value);
        };

        // deno-lint-ignore no-explicit-any
        reject = (error: any) => {
          try {
            signal.removeEventListener("abort", abortHandler!);
          } catch {
            // Ignore cleanup errors
          }
          originalReject(error);
        };

        // Update stored callbacks
        pendingCalls.set(id, { resolve, reject });
      }

      // Send call message
      try {
        const msg: CallMsg = {
          id,
          kind: "call",
          name: name as string,
          // deno-lint-ignore no-explicit-any
          args: args as any[],
        };

        endpoint.postMessage(msg, transfer ?? []);
      } catch (error) {
        pendingCalls.delete(id);
        reject(error);
      }
    });
  };

  // Cleanup function
  const dispose = () => {
    disposed = true;
    cleanupMessageListener();
    cleanupErrorListener();
    pendingCalls.clear();
  };

  // Create API object
  const api = call as RemoteProcedure<Map>;
  api[Symbol.dispose] = dispose;

  return api;
};
