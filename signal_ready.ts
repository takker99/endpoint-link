import type { ReadyMsg } from "./protocol.ts";
import type { Endpoint } from "./shared_types.ts";

/** Signal that this endpoint is ready to receive messages. */

export const signalReady = (endpoint: Endpoint) =>
  endpoint.postMessage({ kind: "ready" } as ReadyMsg, []);
