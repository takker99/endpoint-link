// Endpoint abstraction (MessagePort-like) and Transferable set.

// Phase 1 Transferable union type for Web standards (Deno-compatible subset)
export type Transferable = ArrayBuffer | MessagePort;

export interface Endpoint {
  // deno-lint-ignore no-explicit-any
  postMessage(message: any, transfer?: Transferable[]): void;
  addEventListener(
    type: "message",
    listener: (ev: MessageEvent) => void,
    options?: AddEventListenerOptions,
  ): void;
  start?: () => void;
}
