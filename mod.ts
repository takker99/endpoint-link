import type { Endpoint } from "./shared_types.ts";
import type { HandlerMap, SenderApiFromHandlers } from "./types.ts";
import { genId, isAbortSignal, on, post } from "./utils.ts";
import type { CallMsg, CancelMsg, Msg, ResultMsg } from "./protocol.ts";

export type * from "./types.ts";
export type * from "./shared_types.ts";

// expose: register handlers and return them for typeof inference.
export function expose<H extends HandlerMap>(
  endpoint: Endpoint,
  handlers: H,
): H {
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

  return handlers;
}

// wrap: typed sender created from typeof handlers.
export function wrap<H extends HandlerMap>(
  endpoint: Endpoint,
  methodNames?: (keyof H & string)[],
): SenderApiFromHandlers<H> {
  type API = SenderApiFromHandlers<H>;
  const replies = new Map<
    string,
    // deno-lint-ignore no-explicit-any
    { resolve: (v: any) => void; reject: (e: any) => void }
  >();

  const remove = on(endpoint, (data: Msg) => {
    if (!data) return;
    if (data.kind === "result") {
      // deno-lint-ignore no-explicit-any
      const p = replies.get((data as any).id);
      if (!p) return;
      // deno-lint-ignore no-explicit-any
      if ((data as any).error) p.reject(new Error((data as any).error));
      // deno-lint-ignore no-explicit-any
      else p.resolve((data as any).result);
      // deno-lint-ignore no-explicit-any
      replies.delete((data as any).id);
    }
  });

  // deno-lint-ignore no-explicit-any
  async function prepareArg(arg: any) {
    if (arg && typeof arg.then === "function") {
      return await arg;
    }
    return arg;
  }

  // deno-lint-ignore no-explicit-any
  function call<K extends keyof H & string>(name: K, ...args: any[]): any {
    const id = genId();
    const prom = new Promise((resolve, reject) => {
      replies.set(id, { resolve, reject });

      // extract AbortSignal if given as last arg
      let signal: AbortSignal | undefined;
      if (args.length > 0 && isAbortSignal(args[args.length - 1])) {
        signal = args.pop();
      }

      (async () => {
        try {
          const normalizedArgs = [];
          for (const a of args) normalizedArgs.push(await prepareArg(a));

          if (signal) {
            if (signal.aborted) {
              post(endpoint, { id, kind: "cancel", idRef: id } as CancelMsg);
              replies.delete(id);
              reject(new Error("aborted"));
              return;
            }
            const onAbort = () => {
              post(endpoint, { id, kind: "cancel", idRef: id } as CancelMsg);
              const obj = replies.get(id);
              if (obj) {
                obj.reject(new Error("aborted"));
                replies.delete(id);
              }
            };
            signal.addEventListener("abort", onAbort, { once: true });

            // cleanup listener after resolve/reject
            const orig = replies.get(id)!;
            replies.set(id, {
              // deno-lint-ignore no-explicit-any
              resolve: (v: any) => {
                try {
                  signal!.removeEventListener("abort", onAbort);
                  // deno-lint-ignore no-empty
                } catch {}
                orig.resolve(v);
              },
              // deno-lint-ignore no-explicit-any
              reject: (e: any) => {
                try {
                  signal!.removeEventListener("abort", onAbort);
                  // deno-lint-ignore no-empty
                } catch {}
                orig.reject(e);
              },
            });
          }

          post(
            endpoint,
            {
              id,
              kind: "call",
              name: name as string,
              args: normalizedArgs,
            } as CallMsg,
          );
        } catch (e) {
          replies.delete(id);
          reject(e);
        }
      })();
    });

    return prom;
  }

  // deno-lint-ignore no-explicit-any
  const api: any = {
    call,
    close: () => {
      remove();
      replies.clear();
    },
  };
  if (Array.isArray(methodNames)) {
    for (const m of methodNames) {
      // deno-lint-ignore no-explicit-any
      api[m] = (...args: any[]) => call(m as any, ...args);
    }
  }
  return api as API;
}
