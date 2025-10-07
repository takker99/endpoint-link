# Copilot Instructions for endpoint-link

Lightweight RPC library for MessagePort-like Endpoints (WebWorker-first). Phase
1: non-streaming RPC only.

## Architecture Overview

- **Root-level modules** (no src/ directory): `mod.ts` (public API), `types.ts`
  (complex type mappings), `protocol.ts` (message frames), `utils.ts` (shared
  helpers), `shared_types.ts` (Endpoint interface)
- **Core flow**: `expose()` registers handlers on receiver →
  `wrap<typeof handlers>()` creates typed client → bidirectional RPC via
  protocol frames
- **Type safety**: Complex sender/receiver type mapping where sender args can be
  `T | Promise<T>`, receiver gets `T`, receiver returns `T | Promise<T>`, sender
  gets `Promise<T>`
- **No Proxy**: Explicit `api.call(name, ...args)` or runtime methods from
  `methodNames` array

## Key Patterns

**Testing with MessageChannel pairs**:

```ts
import type { Endpoint } from "@takker/endpoint-link";

function memoryPair(): [Endpoint, Endpoint] {
  const mc = new MessageChannel();
  const [port1, port2] = [mc.port1 as any, mc.port2 as any];
  if (port1.start) port1.start();
  if (port2.start) port2.start();
  return [port1, port2];
}
```

**Handler signature with trailing AbortSignal**:

```ts
const handlers = {
  method(a: number, b: string) {
    return a + b.length;
  },
};
```

**Type-safe wrap usage**:

```ts
import { type Endpoint, wrap } from "@takker/endpoint-link";
const handlers = {
  method(a: number, b: string) {
    return a + b.length;
  },
};
declare const endpoint: Endpoint;

const api = await wrap<typeof handlers>(endpoint);
await api("method", [1, "test"]);
```

**Error handling**: Handler throws → stringified error in protocol →
reconstructed Error on sender

## Development Workflow

- **Deno tasks**: `deno task test` (runs tests + coverage), `deno task check`
  (fmt + lint + type-check + publish dry-run), `deno task fix` (auto-fixes)
- **Web standards only**: No Node.js APIs, compatible with Deno/browser/Workers
- **Custom test assertions**: Uses local `assertEquals`/`assertRejects` instead
  of @std/assert
- **Coverage**: Generated at `coverage/lcov.info`, uploaded to Codecov in CI

## Protocol Implementation Details

**Message frames**: `{ id, kind: "call", name, args }` →
`{ id, kind: "result", result?, error? }` with optional
`{ id, kind: "cancel", idRef }`

**Runtime mechanics**:

- `expose()`: Creates per-call AbortController map, stringifies handler errors,
  handles legacy cancel.id fallback
- `wrap()`: Maintains pending promise map, auto-awaits Promise args before
  sending, extracts trailing AbortSignal

**Critical utilities** (reuse these):

- `utils.ts`: `post()` handles transferables, `on()` works with both
  addEventListener patterns, `genId()` uses crypto.getRandomValues with
  Math.random fallback
- `types.ts`: Complex type mappings for sender/receiver arg/return
  transformation

## Code Style & Testing

**TypeScript patterns**:

- Use `export type`/`import type` for types, prefer inference over explicit
  annotations
- No `any`, no Proxy, no Node.js APIs (Web standards only)
- `// deno-lint-ignore no-explicit-any` when interfacing with untyped
  MessagePort APIs

**Testing conventions**:

- Custom assertions (`assertEquals`, `assertRejects`) to avoid @std/assert
  dependency issues
- Test names format: "component.method behavior" (e.g., "wrap.call resolves on
  success")
- Use `memoryPair()` helper for MessageChannel-based test endpoints
- Cover success, error, cancellation, and transferable scenarios

**Security**: Use `crypto.getRandomValues()` for IDs with Math.random fallback,
validate message shapes, never eval received data

## Future Development

- **Phase 2**: Streaming spec design (no implementation)
- **Phase 3**: Streaming implementation with backpressure and
  MessageChannel-based paths
- Current scope is Phase 1 only: non-streaming RPC with `expose`/`wrap` API
