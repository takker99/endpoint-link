// Minimal protocol frames for Phase 1 (non-stream).

/** RPC call message frame. @internal */
// deno-lint-ignore no-explicit-any
export type CallMsg = { id: string; kind: "call"; name: string; args?: any[] };

/** RPC result message frame. @internal */
export type ResultMsg = {
  id: string;
  kind: "result";
  // deno-lint-ignore no-explicit-any
  result?: any;
  error?: string;
};

/** RPC cancel message frame. @internal */
export type CancelMsg = {
  id: string;
  kind: "cancel";
  idRef?: string;
}; // tolerate legacy 'id'

/** Readiness signal message frame. @internal */
export type ReadyMsg = { kind: "ready" };

/** Union of all protocol message types. @internal */
export type Msg = CallMsg | ResultMsg | CancelMsg | ReadyMsg;
