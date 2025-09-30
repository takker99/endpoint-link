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
  if (typeof endpoint.addEventListener === "function") {
    // deno-lint-ignore no-explicit-any
    const l = (ev: any) => handler(ev.data);
    endpoint.addEventListener("message", l);
    return () =>
      endpoint.removeEventListener &&
      endpoint.removeEventListener("message", l);
  } else if ("onmessage" in endpoint) {
    const prev = endpoint.onmessage;
    // deno-lint-ignore no-explicit-any
    endpoint.onmessage = (ev: any) => handler(ev.data);
    return () => {
      endpoint.onmessage = prev;
    };
  } else {
    return () => {};
  }
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
