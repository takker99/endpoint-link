# endpoint-link

[![JSR](https://jsr.io/badges/@takker/endpoint-link)](https://jsr.io/@takker/endpoint-link)
[![codecov](https://codecov.io/gh/takker99/endpoint-link/branch/main/graph/badge.svg)](https://codecov.io/gh/takker99/endpoint-link)
[![test](https://github.com/takker99/endpoint-link/workflows/ci/badge.svg)](https://github.com/takker99/endpoint-link/actions?query=workflow%3Aci)

Lightweight RPC and streaming for MessagePort-like Endpoints (WebWorker-first)

- expose(endpoint, handlers) / wrap<Handlers>(endpoint): comlink-style API
  without Proxy
- AbortSignal support for RPC cancellation
- Transferable-aware, minimal runtime surface, Deno/jsr-first
- Phase 2 streaming/backpressure specification completed (implementation in
  Phase 3)

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

## Phase 2: Streaming Protocol (Specification)

Phase 2 introduces **streaming and backpressure** capabilities to endpoint-link,
enabling efficient bidirectional data streaming with flow control. The
specification is complete and ready for Phase 3 implementation.

### Key Features

- **Bidirectional streaming**: Support for AsyncIterable/AsyncGenerator patterns
- **Credit-based backpressure**: Maps Web Streams API concepts to flow control
- **Separate MessageChannels**: Dedicated channels for stream data vs. RPC
  control
- **Transferable support**: Efficient transfer of large data (ArrayBuffers,
  etc.)
- **Graceful error handling**: Stream-aware cancellation and error propagation
- **Phase 1 compatibility**: Existing RPC calls work unchanged

### Streaming API Preview

```typescript
// Server-side streaming handler
const handlers = {
  async *generateData(count: number, signal?: AbortSignal) {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;
      yield { index: i, timestamp: Date.now() };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },

  // Bidirectional streaming
  async *echo(input: AsyncIterable<string>, signal?: AbortSignal) {
    for await (const message of input) {
      if (signal?.aborted) break;
      yield `Echo: ${message}`;
    }
  },
};

// Client usage (Phase 3)
declare const worker: Worker;
declare function wrap<T>(endpoint: any, methods: string[]): Promise<any>;

const api = await wrap<typeof handlers>(worker, ["generateData", "echo"]);

// Consume server stream
for await (const data of api.generateData(10)) {
  console.log(data); // { index: 0, timestamp: ... }
}

// Bidirectional streaming
async function* clientMessages() {
  yield "Hello";
  yield "World";
}

for await (const response of api.echo(clientMessages())) {
  console.log(response); // "Echo: Hello", "Echo: World"
}
```

### Backpressure Configuration

```typescript
// Custom backpressure for large data streams
declare const endpoint: any;
declare const methods: string[];
declare function wrapWithOptions(
  endpoint: any,
  methods: string[],
  options: any,
): Promise<any>;

const api = await wrapWithOptions(endpoint, methods, {
  backpressure: {
    highWaterMark: 8 * 1024 * 1024, // 8MB buffer
    sizeFunction: "bytes", // Credit based on byte size
  },
});
```

### Protocol Overview

Phase 2 extends the existing message protocol with streaming frames:

- **stream-open**: Establishes dedicated MessagePort for stream data
- **stream-data**: Carries actual streaming data with credit tracking
- **stream-credit**: Replenishes sender credit for flow control
- **stream-end/error/cancel**: Stream lifecycle management

See `knowledge/phase2-streaming-spec.md` for complete specification including:

- Detailed protocol frames and state machines
- Backpressure algorithms and credit-based flow control
- Error handling and cancellation semantics
- Migration strategy from Phase 1
- Implementation guidelines for Phase 3
