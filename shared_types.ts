// Endpoint abstraction (MessagePort-like) and Transferable set.

/** Phase 1 Transferable union type for Web standards (Deno-compatible subset). */
export type Transferable = ArrayBuffer | MessagePort;

/** MessagePort-like interface for cross-context communication. */
export interface Endpoint {
  /** Send a message with optional transferable objects. */
  // deno-lint-ignore no-explicit-any
  postMessage(message: any, transfer?: Transferable[]): void;

  /** Add event listener for message events. */
  addEventListener(
    type: "message",
    listener: (ev: MessageEvent) => void,
    options?: AddEventListenerOptions,
  ): void;

  /** Optional start method for MessagePort compatibility. */
  start?: () => void;
}
