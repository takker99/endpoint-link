# Copilot Instructions for endpoint-link

Lightweight, standards‑first RPC for MessagePort‑like Endpoints
(WebWorker‑first). This document is the single source of truth for Copilot
(Coding Agent) when contributing to this repo.

It is inspired by:

- Deno Standard Library contributing practices
  ([Contributing Guide](https://github.com/denoland/std/blob/main/.github/CONTRIBUTING.md))
- Ultracite’s AI‑ready ruleset (type safety, consistency, AI‑friendly
  generation)

## Project context and principles

- Endpoint‑first: wrap MessagePort‑like interfaces to provide comlink‑style RPC
- Web standards only, no Node‑only runtime APIs
- Zero external dependencies; minimal surface area; no Proxy
- Type safety first: API types flow from `expose()` handlers to
  `wrap<typeof handlers>()`
- Tests and coverage for every behavior shipped
- AI‑friendly code generation: explicit, deterministic, small functions; avoid
  magic

## Before writing code

1. Analyze existing patterns; reuse utilities (`post`, `on`, `genId`) and types
2. Consider edge cases and error scenarios (handler throws, cancel races, bad
   name, missing result)
3. Follow the rules below strictly (style, typing, module layout)
4. Validate Deno compatibility (Web APIs only) and add tests
5. Keep public docs updated (JSDoc on exported APIs, short module docs in
   `mod.ts`)

## Scope (Phase 1 only: non‑stream RPC)

- Implement comlink‑style RPC without Proxy:
  - `expose(endpoint, handlers)` registers receiver handlers; appends
    `AbortSignal` as the final argument
  - `wrap<typeof handlers>(endpoint, methodNames?)` creates a typed client with
    `api.call(name, ...args)` and runtime methods for `methodNames`
- Protocol frames: `call`, `result`, `cancel`
- Cancellation: client may pass `AbortSignal` as last argument; `wrap` sends
  `cancel`, `expose` aborts per‑call controller
- Error propagation: handler throws → sender receives rejected promise with
  error message
- Transferables (e.g., ArrayBuffer) may be sent via postMessage’s transfer list

Out of scope (Phase 1):

- Streaming (Iterable/AsyncIterable/ReadableStream), backpressure, secondary
  MessageChannel
- Stream‑level error/cancel frames
- Any non‑Web standard runtime feature

Future phases:

- Phase 2: Streaming/backpressure spec (design doc, no code)
- Phase 3: Streaming/backpressure implementation and tests

## Repository layout and conventions

All files live at the repository root (no `src/`, no `test/`):

- `mod.ts` — public API for Phase 1 (`expose`, `wrap`)
- `shared_types.ts` — `Endpoint` (MessagePort‑like), `Transferable` union
- `protocol.ts` — `CallMsg`, `ResultMsg`, `CancelMsg`, `Msg`
- `types.ts` — handler typing and `SenderApiFromHandlers`
- `utils.ts` — `post`, `on`, `isAbortSignal`, `genId`
- `rpc_basic_test.ts` — tests for Phase 1
- `.github/workflows/deno.yml` — CI: run tests and coverage
- `deno.jsonc` — Deno config and tasks
- `README.md` — quickstart; Phase 1 only (no streams yet)

Deno/JSR first:

- ESM, strict TS
- No `package.json` / `tsconfig.json`
- Use Deno `tasks` (`deno.jsonc`)

## Protocol (Phase 1)

- `call`: `{ id, kind: "call", name, args }`
- `result`: `{ id, kind: "result", result?, error? }`
- `cancel`: `{ id, kind: "cancel", idRef?: string, id?: string }` (tolerate
  legacy `id`)

## Architecture (Phase 1 runtime)

- `expose(endpoint, handlers)`:
  - Listen for `call` and `cancel`
  - On `call`, create `AbortController` per id, invoke handler as
    `(...args, ac.signal)`
  - Send `result` with `result` or with `error` (stringified)
  - On `cancel`, abort the corresponding controller, clean up map
- `wrap<typeof handlers>(endpoint, methodNames?)`:
  - Maintain pending map `id -> { resolve, reject }`
  - Provide `call(name, ...args)` and attach runtime convenience methods for
    `methodNames`
  - If last arg is an `AbortSignal`, pop it, wire cancel, and reject promise on
    abort
  - Await Promise‑like args before sending (sender → receiver mapping allows
    `T | Promise<T>`)

## Type rules (Phase 1)

- Sender → Receiver: `T | Promise<T>` is allowed; receiver sees `T`
- Receiver → Sender: `T | Promise<T>` is allowed; sender receives `Promise<T>`
- `wrap<typeof handlers>(endpoint, ["foo"])` yields
  `api.foo(...args) => Promise<Ret>`
- Handler signature in `expose` accepts optional trailing `AbortSignal`

## Coding rules (AI‑ready, adapted from Ultracite and Deno)

TypeScript best practices:

- Use `export type` / `import type` for types
- No `any`, no `namespace`, no `const enum`, no non‑null `!` where avoidable
- Prefer inference; avoid redundant type annotations on literals
- Prefer `as const` for literal narrowing when needed
- Keep functions small and composable; avoid overly complex control flow

Style and correctness:

- No Proxy
- No Node‑only runtime APIs; rely on Web standards (MessagePort, MessageChannel)
- Prefer early returns over deep nesting
- Use `===`/`!==`; no yoda conditions
- Avoid `console`; tests use `@std/assert` for assertions
- Clear, deterministic error messages (Deno std style): sentence case, no
  trailing period
- JSDoc for public symbols: description, `@param`, `@returns`, and an `@example`
- Module doc in `mod.ts`: short description + minimal usage snippet
- Avoid global mutable state; everything per‑endpoint instance
- Do not suppress with `// @ts-ignore` (fix types instead)

Testing:

- Deno tests with `@std/assert` only
- Test names must state symbol and criterion (e.g., “wrap.call resolves on
  success”)
- Cover: success, error, cancel, transferables
- Target 80%+ coverage for core files (mod, utils)

Security and safety:

- Generate ids using `crypto.getRandomValues` with fallback
- Validate message shape before acting (cheap guards)
- Never execute or eval received code
- Assume endpoints may be untrusted; do not expose arbitrary surface beyond
  named handlers

## Commands

- Run tests and generate coverage:
  - `deno task test`
- Lint/format:
  - `deno fmt`
  - `deno lint`

## Commit, branch, PR

- Branch naming: `feat/phase1-core` (Phase 1), `docs/…`, `fix/…`
- Commit messages (Deno std‑style scopes):
  - `feat(core): implement expose/wrap`
  - `fix(core): cancel message uses idRef`
  - `docs(readme): add quickstart`
- PR titles:
  - `feat(core): Phase 1 non-stream RPC`
  - `test(core): add abort & error propagation tests`

## Tasks for Copilot (Phase 1)

Implement or ensure the following files exist and pass tests:

1. `shared_types.ts`
   - `Endpoint` (MessagePort‑like), `Transferable` union

2. `protocol.ts`
   - `CallMsg`, `ResultMsg`, `CancelMsg`, `Msg`

3. `utils.ts`
   - `post(endpoint, msg, transfer?)`
   - `on(endpoint, handler)`
   - `isAbortSignal(x)`
   - `genId()`

4. `types.ts`
   - Handler typing with trailing optional `AbortSignal`
   - Sender arg mapping (`U | Promise<U>`)
   - `SenderApiFromHandlers<H>`

5. `mod.ts`
   - Export `{ expose, wrap }`
   - Implement runtime per Architecture section

6. `rpc_basic_test.ts`
   - In‑memory `Endpoint` pair via `MessageChannel`
   - Tests: success (value + Promise), error propagation, abort, ArrayBuffer
     transferable

7. `.github/workflows/cu.yml`
   - CI: `deno task test` and upload `coverage.lcov`

8. `README.md`
   - Quickstart for Phase 1 (no streams yet)

Acceptance:

- All tests pass locally and in CI
- `coverage.lcov` generated by CI
- Public API for Phase 1 is exactly `{ expose, wrap }`
- Type‑level mapping verified by building against `wrap<typeof handlers>`

## Phase 2 / Phase 3 (create issues, do not implement now)

- Phase 2: Streaming/backpressure spec
  - QueuingStrategy alignment; credit unit (count vs bytes)
  - Frames: `stream-open`, `stream-data(values)`, `stream-credit(credit)`,
    `stream-end`, `stream-error`, `stream-cancel`
  - One‑way and bidirectional streaming call sequences
  - Transferables in streaming frames; separation of control vs stream channels

- Phase 3: Streaming/backpressure implementation
  - MessageChannel‑based stream paths (args and results)
  - Backpressure loops; error/cancel interplay
  - Tests for one‑way/bidirectional streams, abort, transferables

Thank you!
