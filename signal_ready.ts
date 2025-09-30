import { post } from "./post.ts";
import type { ReadyMsg } from "./protocol.ts";
import type { Endpoint } from "./shared_types.ts";

/** Signal that this endpoint is ready to receive messages. */

export const signalReady = (endpoint: Endpoint) =>
  post(endpoint, { kind: "ready" } as ReadyMsg);
