# endpoint-link

[![JSR](https://jsr.io/badges/@takker/endpoint-link)](https://jsr.io/@takker/endpoint-link)
[![codecov](https://codecov.io/gh/takker99/endpoint-link/branch/main/graph/badge.svg)](https://codecov.io/gh/takker99/endpoint-link)
[![test](https://github.com/takker99/endpoint-link/workflows/ci/badge.svg)](https://github.com/takker99/endpoint-link/actions?query=workflow%3Aci)

Lightweight RPC and streaming for MessagePort-like Endpoints (WebWorker-first)

- expose(endpoint, handlers) / wrap<Handlers>(endpoint): comlink-style API
  without Proxy
- AbortSignal support for RPC cancellation
- Transferable-aware, minimal runtime surface, Deno/jsr-first
- Streams/backpressure will be implemented in Phase 3

Quick example (Phase 1: non-stream)

```ts
// worker.ts
import { expose } from "./mod.ts";

const handlers = {
  async add(a: number, b: number, _signal?: AbortSignal) {
    return a + b;
  },
  fail(_n: number, _signal?: AbortSignal): never {
    throw new Error("boom");
  },
};
export type Receiver = typeof handlers;
expose(self as any, handlers);

// main.ts
import { wrap } from "./mod.ts";
//import type { Receiver } from "./worker.ts";

const api = wrap<Receiver>(new Worker("./worker.ts", { type: "module" }), [
  "add",
  "fail",
]);
const sum = await api.add(1, 2); // 3
try {
  await api.fail(1);
} catch (e) {
  console.log((e as unknown as Error).message); // "boom"
}
```
