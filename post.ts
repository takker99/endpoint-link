import type { Endpoint } from "./shared_types.ts";

// post wrapper handling transferables when available.

export const post = (
  endpoint: Endpoint,
  // deno-lint-ignore no-explicit-any
  msg: any,
  transfer?: Transferable[],
) => {
  try {
    if (transfer && transfer.length) {
      endpoint.postMessage(msg, transfer);
    } else {
      endpoint.postMessage(msg);
    }
  } catch {
    // deno-lint-ignore no-explicit-any
    (endpoint as any).postMessage(msg);
  }
};
