import type { Endpoint } from "./shared_types.ts";

// post wrapper handling transferables when available.
// deno-lint-ignore no-explicit-any
export function post(endpoint: Endpoint, msg: any, transfer?: Transferable[]) {
  try {
    if (transfer && transfer.length) {
      // @ts-ignore: runtime may accept second arg
      endpoint.postMessage(msg, transfer);
    } else {
      endpoint.postMessage(msg);
    }
  } catch {
    // deno-lint-ignore no-explicit-any
    (endpoint as any).postMessage(msg);
  }
}

// attach message listener; returns a remover.
// deno-lint-ignore no-explicit-any
export function on(endpoint: Endpoint, handler: (data: any) => void) {
  const controller = new AbortController();
  // deno-lint-ignore no-explicit-any
  endpoint.addEventListener("message", (ev: any) => handler(ev.data), {
    signal: controller.signal,
  });
  return controller.abort.bind(controller);
}

// deno-lint-ignore no-explicit-any
export function isAbortSignal(x: any): x is AbortSignal {
  return !!x && typeof x === "object" && "aborted" in x &&
    // deno-lint-ignore no-explicit-any
    typeof (x as any).addEventListener === "function";
}

export function genId() {
  try {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2);
  }
}
