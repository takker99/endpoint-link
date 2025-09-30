# Copilot Instructions for endpoint-link

A lightweight, standards-first RPC library for MessagePort-like Endpoints (WebWorker-first).
This document guides Copilot (Coding Agent) on how to implement Phase 1 (non‑stream RPC), test it, and prepare for later phases.

Goals (Phase 1)
- Implement non-stream RPC over a MessagePort-like Endpoint abstraction.
- Provide comlink-style API without Proxy: `expose(endpoint, handlers)` and `wrap<typeof handlers>(endpoint, methodNames?)`.
- Ensure type-safe sender methods (derived from `typeof handlers`).
- Support AbortSignal-based cancellation (client passes `AbortSignal` as the last argument; receiver uses `AbortController` per call).
- Propagate errors from handlers to the client.
- Support Transferables (e.g., ArrayBuffer) when posting messages.
- Keep all source files at repository root (no src/ or test/ folders). Entry point = `mod.ts`.

Non-Goals (Phase 1)
- Streaming (Iterable/AsyncIterable/ReadableStream) and backpressure — these are Phase 3.
- Secondary MessageChannel for streaming — Phase 3.
- Stream-level cancel/error frames — Phase 3.

Repository conventions
- Deno / jsr-first. Use `deno.jsonc` tasks. No package.json / tsconfig.
- ESM, strict TypeScript. Web-standard APIs only; avoid Node-only APIs.
- Public API (Phase 1): export `{ expose, wrap }` from `mod.ts`.
- Place files at repository root:
  - `mod.ts` (public API, Phase 1)
  - `utils.ts`, `protocol.ts`, `shared_types.ts`, `types.ts`
  - `rpc_basic_test.ts` (Deno tests for Phase 1)
  - `.github/workflows/deno.yml` (CI: run tests + coverage)
- Error messages: follow Deno std style (sentence case, no trailing periods, clear actionable phrasing).
- JSDoc for public symbols (short description, @param, @returns, example). Module docs in `mod.ts`.

Protocol (Phase 1)
- `call`: `{ id, kind: "call", name, args }`
- `result`: `{ id, kind: "result", result? , error? }`
- `cancel`: `{ id, kind: "cancel", idRef?: string, id?: string }` (tolerate `id` legacy)

Runtime behavior
- expose:
  - Listen for `call` and `cancel` on the Endpoint.
  - On `call`, create `AbortController` per id; invoke handler as `(...args, signal)`; send `result` with value or error string.
  - On `cancel`, abort the corresponding controller.
- wrap:
  - Provide `api.call(name, ...args)` and runtime convenience methods for keys in `methodNames`.
  - If last arg is `AbortSignal`, pop it and wire cancel; on abort, send `cancel` and reject the pending call.
  - Await Promise-like args before posting.

Type rules (Phase 1)
- Sender→Receiver: sender may pass `T | Promise<T>`; receiver receives `T`.
- Receiver→Sender: receiver may return `T | Promise<T>`; sender receives `Promise<T>`.
- `wrap<typeof handlers>(endpoint, ["foo"])` yields `api.foo(...args) => Promise<Ret>` with proper arg/return types.

Tasks for Copilot (Phase 1)
1) Ensure/implement the following files (root-level):
   - `shared_types.ts`: `Endpoint` (MessagePort-like), `Transferable` union type.
   - `protocol.ts`: `CallMsg`, `ResultMsg`, `CancelMsg`, `Msg` union.
   - `utils.ts`: `post(endpoint, msg, transfer?)`, `on(endpoint, handler)`, `isAbortSignal`, `genId`.
   - `types.ts`: type utilities for handler/args mapping and `SenderApiFromHandlers`.
   - `mod.ts`: implement `expose` and `wrap` per behavior above.
   - `rpc_basic_test.ts`: Deno tests covering success, error, abort, and ArrayBuffer handling.
   - `.github/workflows/deno.yml`: CI runs `deno task test` and uploads coverage `coverage.lcov` (Codecov step can be no-op).
2) Keep code minimal, no Proxy, no extra deps.
3) Make tests pass via `deno task test` and produce coverage.

Acceptance Criteria
- All tests (`rpc_basic_test.ts`) pass.
- `deno coverage cov --lcov > coverage.lcov` produces a report; CI workflow runs successfully.
- Public API matches: `expose`, `wrap` exported from `mod.ts`.
- Type-level mapping verified by tests building against `wrap<typeof handlers>`.

Future work (Phase 2/3) — do NOT implement now
- Stream/backpressure using `stream-credit` and QueuingStrategy
- MessageChannel-based stream path (args/result)
- Stream error/cancel frames, dual-stream in a single RPC call

References
- Style/Contrib inspiration: deno std contributing guide
- General pattern: comlink-style naming without Proxy.