// Minimal protocol frames for Phase 1 (non-stream).
// deno-lint-ignore no-explicit-any
export type CallMsg = { id: string; kind: "call"; name: string; args?: any[] };
export type ResultMsg = {
  id: string;
  kind: "result";
// deno-lint-ignore no-explicit-any
  result?: any;
  error?: string;
};
export type CancelMsg = {
  id: string;
  kind: "cancel";
  idRef?: string;
}; // tolerate legacy 'id'
export type Msg = CallMsg | ResultMsg | CancelMsg;