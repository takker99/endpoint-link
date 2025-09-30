# Phase 2: Streaming and Backpressure Specification

## Overview

This document specifies the streaming and backpressure protocol for
endpoint-link Phase 2, extending the existing Phase 1 non-streaming RPC
framework with bidirectional streaming capabilities and credit-based flow
control.

## Goals

- Define a protocol for streaming data between sender and receiver with
  backpressure support
- Align Web Streams API QueuingStrategy (size/highWaterMark) with credit-based
  flow control
- Specify message frames for streaming operations
- Document single-direction and bidirectional streaming call semantics
- Address error/cancel/abort propagation in streaming contexts
- Support Transferable objects in streaming frames
- Maintain compatibility with Phase 1 non-streaming RPC

## Core Concepts

### Streaming Architecture

Phase 2 introduces **separate MessageChannel pairs** for stream data transport,
distinct from the main RPC control channel. This separation provides:

1. **Performance isolation**: Stream data doesn't interfere with RPC control
   messages
2. **Backpressure management**: Independent flow control per stream
3. **Resource management**: Streams can be closed/cleaned up independently
4. **Security boundaries**: Different validation/sanitization for control vs.
   data

### Credit-Based Flow Control

The backpressure system maps Web Streams API concepts to credit-based flow
control:

- **highWaterMark**: Maximum pending credit units before applying backpressure
- **size()**: Function to determine credit cost per data chunk (defaults to 1)
- **Credit**: Available buffer space for receiver to accept data
- **Backpressure**: When sender must wait for additional credit before sending

## Protocol Specification

### Message Frame Types

Phase 2 extends the existing `Msg` union with streaming frames:

```typescript
// Phase 1 frames (unchanged)
type CallMsg = { id: string; kind: "call"; name: string; args?: any[] };
type ResultMsg = { id: string; kind: "result"; result?: any; error?: string };
type CancelMsg = { id: string; kind: "cancel"; idRef?: string };
type ReadyMsg = { kind: "ready" };

// Phase 2 streaming frames
type StreamOpenMsg = {
  id: string;
  kind: "stream-open";
  streamId: string;
  port: MessagePort; // Dedicated channel for this stream
  direction: "send" | "receive" | "bidirectional";
  highWaterMark?: number;
  sizeFunction?: "bytes" | "items"; // Predefined sizing strategies
};

type StreamDataMsg = {
  streamId: string;
  kind: "stream-data";
  value: any;
  done?: boolean; // Final chunk indicator
};

type StreamCreditMsg = {
  streamId: string;
  kind: "stream-credit";
  credit: number; // Available buffer space
};

type StreamEndMsg = {
  streamId: string;
  kind: "stream-end";
};

type StreamErrorMsg = {
  streamId: string;
  kind: "stream-error";
  error: string;
};

type StreamCancelMsg = {
  streamId: string;
  kind: "stream-cancel";
};

// Extended message union
type Msg =
  | CallMsg
  | ResultMsg
  | CancelMsg
  | ReadyMsg
  | StreamOpenMsg
  | StreamDataMsg
  | StreamCreditMsg
  | StreamEndMsg
  | StreamErrorMsg
  | StreamCancelMsg;
```

### Stream Lifecycle States

Each stream maintains state according to this machine:

```
[IDLE] 
  ↓ stream-open
[OPENING]
  ↓ port established
[ACTIVE] ←→ stream-data/stream-credit (backpressure loop)
  ↓ stream-end/stream-error/stream-cancel
[CLOSING]
  ↓ cleanup complete
[CLOSED]
```

### Backpressure Flow Control

#### Credit Calculation

- Initial credit = `highWaterMark` (default: 16)
- Credit consumption = `sizeFunction(data)` (default: 1 per item)
- Credit replenishment via `stream-credit` messages

#### Flow Control Algorithm

1. **Sender**: Check available credit before sending `stream-data`
2. **Receiver**: Consume credit, process data, send `stream-credit` to replenish
3. **Backpressure**: Sender waits when credit < `sizeFunction(nextData)`

#### Size Strategies

- `"items"`: Each data item costs 1 credit (default)
- `"bytes"`: Data size in bytes (for ArrayBuffer/typed arrays)

## Streaming RPC Examples

### Unidirectional Stream (Server → Client)

```typescript
// Handler (server side)
const handlers = {
  async *generateNumbers(count: number, signal?: AbortSignal) {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;
      yield i;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  },
};

// Client usage
declare const endpoint: any;
declare function wrap<T>(endpoint: any, methods: string[]): Promise<any>;

async function example() {
  const api = await wrap<typeof handlers>(endpoint, ["generateNumbers"]);
  const stream = api.generateNumbers(10);

  for await (const number of stream) {
    console.log(number); // 0, 1, 2, ..., 9
  }
}
```

### Bidirectional Stream

````typescript
// Handler (echo service)
const handlers = {
  async *echo(input: AsyncIterable<string>, signal?: AbortSignal) {
    for await (const msg of input) {
      if (signal?.aborted) break;
      yield `Echo: ${msg}`;
    }
  }
};

// Client usage
```typescript
// Bidirectional streaming
async function* clientMessages() {
  yield "Hello";
  yield "World";
}

declare const endpoint: any;
declare function wrap<T>(endpoint: any, methods: string[]): Promise<any>;

async function bidirectionalExample() {
  const api = await wrap<typeof handlers>(endpoint, ["echo"]);
  const echoStream = api.echo(clientMessages());

  for await (const response of echoStream) {
    console.log(response); // "Echo: Hello", "Echo: World"
  }
}
````

## Error and Cancellation Semantics

### Error Propagation

- **Handler errors**: Sent as `stream-error` frames, stream enters CLOSING state
- **Network errors**: Detected via MessagePort error events, trigger cleanup
- **Validation errors**: Malformed frames trigger `stream-error`

### Cancellation

- **AbortSignal**: Handler receives signal, can abort gracefully
- **Stream cancel**: `stream-cancel` frame immediately closes stream
- **RPC cancel**: Original `cancel` frame closes all associated streams

### Resource Cleanup

- MessagePort pairs are closed when streams end
- Credit tracking maps are cleared
- Pending promises are rejected with appropriate errors

## Transferable Support

Streaming frames support Transferable objects with special handling:

```typescript
export type StreamDataMsg = {
  streamId: string;
  kind: "stream-data";
  value: any;
  done?: boolean;
  transfer?: Transferable[]; // Objects to transfer ownership
};
```

**Transfer semantics**:

- Transferables in `value` are automatically detected and transferred
- Large ArrayBuffers are transferred to avoid copying
- MessagePorts can be transferred for nested streams

## Compatibility and Migration

### Phase 1 Compatibility

- All existing Phase 1 RPC calls work unchanged
- New streaming methods are opt-in via generator functions
- Type system gracefully handles mixed sync/async/streaming methods

### Migration Strategy

1. **Gradual adoption**: Add streaming methods alongside existing RPC
2. **Feature detection**: Check for streaming support via capability negotiation
3. **Fallback behavior**: Streaming methods can provide non-streaming
   alternatives
4. **Version negotiation**: Protocol version in ready handshake

### Type System Integration

```typescript
// Extended handler function types
type StreamingHandlerFn<Args extends any[] = any[], R = any> = (
  ...args: Args
) => R | AsyncIterable<R> | AsyncGenerator<R>;

// API generation handles both sync and streaming returns
type SenderApiFromHandlers<H extends Record<string, any>> = {
  [K in keyof H & string]: ReturnType<H[K]> extends AsyncIterable<infer T>
    ? (...args: Parameters<H[K]>) => AsyncIterable<T>
    : (...args: Parameters<H[K]>) => Promise<ReturnType<H[K]>>;
};
```

## Implementation Phases

### Phase 2 (Current Scope)

- ✅ Protocol specification and design (this document)
- ✅ Message frame definitions
- ✅ State machine design
- ✅ Backpressure algorithm specification
- ✅ Error/cancel semantics
- ✅ Migration strategy

### Phase 3 (Future Implementation)

- Stream handler registration and detection
- MessageChannel creation and management
- Credit-based flow control implementation
- AsyncIterable/AsyncGenerator integration
- Comprehensive streaming test suite
- Performance optimization and benchmarking

## Security Considerations

- **Message validation**: All streaming frames validated for structure and types
- **Resource limits**: Credit system prevents unbounded buffering
- **Isolation**: Separate channels prevent cross-stream interference
- **Cleanup**: Automatic resource cleanup prevents memory leaks

## Performance Characteristics

- **Low latency**: Direct MessagePort communication for stream data
- **Memory efficient**: Credit system bounds memory usage
- **Scalable**: Multiple concurrent streams with independent flow control
- **Zero-copy**: Transferable support for large data without serialization
  overhead
