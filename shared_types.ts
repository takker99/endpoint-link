// Endpoint abstraction (MessagePort-like) and Transferable set.

export interface Endpoint {
  // deno-lint-ignore no-explicit-any
  postMessage(message: any, transfer?: Transferable[]): void;
  addEventListener?(
    type: "message",
    // deno-lint-ignore no-explicit-any
    listener: (ev: { data: any }) => void,
  ): void;
  removeEventListener?(
    type: "message",
    // deno-lint-ignore no-explicit-any
    listener: (ev: { data: any }) => void,
  ): void;
  // deno-lint-ignore no-explicit-any
  onmessage?: ((ev: { data: any }) => void) | null;
  start?: () => void;
}
