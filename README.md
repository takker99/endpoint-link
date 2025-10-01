# endpoint-link

[![JSR](https://jsr.io/badges/@takker/endpoint-link)](https://jsr.io/@takker/endpoint-link)
[![codecov](https://codecov.io/gh/takker99/endpoint-link/branch/main/graph/badge.svg)](https://codecov.io/gh/takker99/endpoint-link)
[![test](https://github.com/takker99/endpoint-link/workflows/ci/badge.svg)](https://github.com/takker99/endpoint-link/actions?query=workflow%3Aci)

Lightweight RPC and streaming for MessagePort-like Endpoints (WebWorker-first)

- expose(endpoint, handlers) / wrap<Handlers>(endpoint): comlink-style API
  without Proxy
- AbortSignal support for RPC cancellation
- Disposable support for resource cleanup with `using` syntax
- Transferable-aware, minimal runtime surface, Deno/jsr-first
- Streams/backpressure will be implemented in Phase 3

Quick example (Phase 1: non-stream)

```ts
// worker.ts
import { expose } from "@takker/endpoint-link";

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
import { wrap } from "@takker/endpoint-link";
//import type { Receiver } from "./worker.ts";

const api = await wrap<Receiver>(
  new Worker("./worker.ts", { type: "module" }),
  [
    "add",
    "fail",
  ],
);
const sum = await api.add(1, 2); // 3
try {
  await api.fail(1);
} catch (e) {
  console.log((e as unknown as Error).message); // "boom"
}
```

## Resource Management with `using`

Both `expose` and `wrap` return Disposable objects that can be used with the
`using` syntax for automatic cleanup:

```ts ignore
// Automatic cleanup with using
{
  using disposable = expose(endpoint, handlers);
  using api = await wrap<Handlers>(endpoint, ["method"]);
  await api.method();
  // Automatically disposed when exiting the block
}

// Manual cleanup
const api = await wrap<Handlers>(endpoint, ["method"]);
api.close(); // or api[Symbol.dispose]()

// After disposal, calling the API throws an error
api.method(); // throws "API has been disposed"
```
