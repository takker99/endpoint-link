# Copilot Instructions for endpoint-link

Lightweight type-safe RPC library for MessagePort-like Endpoints (WebWorker,
BroadcastChannel, etc.). Phase 1: non-streaming RPC only.

## Architecture Overview

- **Root-level modules** (no src/ directory): `mod.ts` (public API),
  `expose.ts`, `wrap.ts`, `types.ts` (type definitions), `protocol.ts` (message
  frames), `shared_types.ts` (Endpoint interface)
- **Core flow**: `expose()` registers handlers on receiver + signals ready →
  `wrap()` waits for ready signal → creates typed client → bidirectional RPC via
  protocol frames
- **Type safety**: Full TypeScript inference with `RemoteProcedure<Map>`
  interface
- **Explicit API**: `api(name, [args], options?)` pattern - no Proxy, no magic
- **Resource management**: Both `expose()` and `wrap()` return Disposables for
  use with `using` syntax

## Key Patterns

**Testing with MessageChannel pairs** (see `test_utils.ts`):

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

**Handler signature** (trailing optional AbortSignal):

```ts
const handlers = {
  add(a: number, b: number, signal?: AbortSignal) {
    return a + b;
  },
};
```

**Complete usage pattern with resource management**:

```ts
import { type Endpoint, expose, wrap } from "@takker/endpoint-link";
declare const endpoint: Endpoint;
declare const handlers: {
  add(a: number, b: number, signal?: AbortSignal): number;
  processBuffer(buffer: ArrayBuffer, signal?: AbortSignal): Promise<number>;
  longTask(ms: number, signal?: AbortSignal): Promise<string>;
};

// Server
using disposable = expose(endpoint, handlers);

// Client - with timeout via AbortSignal.timeout()
using api = await wrap<typeof handlers>(endpoint, {
  signal: AbortSignal.timeout(5000),
});
const result = await api("add", [1, 2]); // 3

// With AbortSignal for individual calls
const callController = new AbortController();
await api("longTask", [1000], { signal: callController.signal });

// With Transferable
const buffer = new ArrayBuffer(8);
await api("processBuffer", [buffer], { transfer: [buffer] });
```

**Critical constraints**:

- Arguments must NOT be Promises (throws TypeError) - await before passing
- Args passed as array: `api(name, [arg1, arg2])` not `api(name, arg1, arg2)`
- Options go in third parameter: `{ signal?, transfer? }`
- Handler errors → stringified in protocol → reconstructed as Error on sender

## Development Workflow

- **Deno tasks**: `deno task test` (runs tests + coverage), `deno task check`
  (fmt + lint + type-check + publish dry-run), `deno task fix` (auto-fixes)
- **Web standards only**: No Node.js APIs, compatible with Deno/browser/Workers
- **Test assertions**: Uses @std/assert (`assertEquals`, `assertRejects`,
  `assertThrows`)
- **Test helpers**: `memoryPair()` and `closePorts()` in `test_utils.ts` for
  MessageChannel-based tests
- **Coverage**: Generated at `coverage/`, uploaded to Codecov in CI

## Protocol Implementation Details

**Message frames**: `{ kind: "ready" }` → `{ id, kind: "call", name, args }` →
`{ id, kind: "result", result?, error? }` with optional
`{ id, kind: "cancel", idRef }`

**Readiness handshake**: `expose()` sends "ready" signal immediately; `wrap()`
waits for it (default 5s timeout) before allowing calls

**Runtime mechanics**:

- `expose()`: Creates per-call AbortController map, stringifies handler errors,
  handles legacy cancel.id fallback
- `wrap()`: Validates args aren't Promises (throws TypeError), maintains pending
  promise map, sends cancel on AbortSignal

**Critical utilities** (reuse these):

- `on.ts`: `on()` attaches listeners supporting both addEventListener and
  onmessage patterns, `onMessageError()` for deserialization errors
- `gen_id.ts`: `genId()` uses crypto.getRandomValues (no fallback)
- `signal_ready.ts`/`wait_for_ready.ts`: Readiness handshake implementation
- `types.ts`: `RemoteProcedure<Map>` interface with Disposable support

## Code Style & Testing

**TypeScript patterns**:

- Use `export type`/`import type` for types, prefer inference over explicit
  annotations
- No `any`, no Proxy, no Node.js APIs (Web standards only)
- `// deno-lint-ignore no-explicit-any` when interfacing with untyped
  MessagePort APIs

**Testing conventions**:

- **Test file naming**: `filename.ts` → `filename_test.ts` (one test file per
  module)
  - Each module's tests are contained in their corresponding `*_test.ts` file
  - Exception: Integration tests combining multiple modules use semantic names
    (e.g., `mod_test.ts` for top-level API tests, `worker_test.ts` for worker
    integration)
- Use @std/assert: `assertEquals`, `assertRejects`, `assertThrows`
- Test names format: "Component: behavior description" (e.g., "RPC basic success
  (value + Promise)")
- Use `memoryPair()` and `closePorts()` helpers from `test_utils.ts`
- Always use `using` for resource management in tests
- Cover success, error, cancellation, and transferable scenarios

**Security**: Use `crypto.getRandomValues()` for IDs, validate message shapes,
never eval received data

## Future Development

- **Phase 2**: Streaming spec design (no implementation)
- **Phase 3**: Streaming implementation with backpressure and
  MessageChannel-based paths
- Current scope is Phase 1 only: non-streaming RPC with `expose`/`wrap` API
