# Phase 2 Design Rationale

## MessageChannel Separation for Stream Data

### Problem Statement

In Phase 1, all RPC communication occurs over a single MessagePort channel,
mixing control messages (call, result, cancel) with data payload. For streaming
scenarios, this creates several issues:

1. **Head-of-line blocking**: Large stream data can delay critical control
   messages
2. **Backpressure interference**: Stream flow control affects non-streaming RPC
   calls
3. **Resource contention**: Single channel becomes a bottleneck for concurrent
   streams
4. **Complex state management**: Mixed message types complicate protocol
   handling

### Solution: Dedicated Stream Channels

Phase 2 introduces **separate MessageChannel pairs** for each stream, distinct
from the main RPC control channel:

```
Main RPC Channel:
├── call/result/cancel/ready (Phase 1 messages)
└── stream-open (establishes new stream)

Stream Channel (per stream):
├── stream-data (actual streaming content)  
├── stream-credit (backpressure control)
├── stream-end/error/cancel (lifecycle)
└── Transferable objects (efficient large data)
```

### Benefits

#### 1. Performance Isolation

- **Parallel processing**: Stream data and RPC control processed independently
- **No interference**: Large stream payloads don't block urgent control messages
- **Concurrent streams**: Multiple streams operate without mutual interference
- **Optimized parsing**: Stream channels handle only data/credit messages

#### 2. Independent Flow Control

- **Per-stream backpressure**: Each stream has its own credit tracking
- **Granular control**: Different streams can use different backpressure
  strategies
- **Resource management**: Stream buffers isolated from RPC message queues
- **Scalable design**: Flow control complexity doesn't affect main RPC channel

#### 3. Security and Validation

- **Separate validation**: Stream data validated differently than control
  messages
- **Isolation boundaries**: Stream errors don't corrupt main RPC protocol state
- **Resource limits**: Per-stream limits prevent resource exhaustion attacks
- **Clean separation**: Stream data handling isolated from RPC logic

#### 4. Transferable Efficiency

- **Direct transfer**: Large ArrayBuffers transferred without protocol overhead
- **Zero serialization**: Transferable objects bypass JSON serialization
- **Memory efficiency**: No copying of large data structures
- **Dedicated channel**: Transferables don't interfere with control message
  parsing

### Implementation Strategy

#### Stream Establishment Flow

1. Client calls streaming method via main RPC channel
2. Server recognizes streaming return type (AsyncIterable/AsyncGenerator)
3. Server creates MessageChannel pair for this stream
4. Server sends `stream-open` with MessagePort to client via main channel
5. Subsequent stream data flows through dedicated channel
6. Stream lifecycle managed independently of main RPC

#### Credit-Based Flow Control

Each stream channel implements independent backpressure:

```typescript
// Per-stream state (isolated from main RPC)
interface StreamState {
  id: string;
  port: MessagePort;
  credit: number; // Available buffer space
  highWaterMark: number; // Backpressure threshold
  sizeFunction: (data: any) => number; // Credit calculation
  pendingData: any[]; // Buffer for backpressure
}
```

#### Resource Management

- **Automatic cleanup**: Stream channels closed when stream completes
- **Memory bounds**: Credit system prevents unbounded buffering
- **Garbage collection**: Closed channels eligible for GC immediately
- **Error isolation**: Stream failures don't affect other streams or main RPC

### Alternative Approaches Considered

#### 1. Single Channel with Priority Queues

**Rejected**: Complex priority management, still subject to head-of-line
blocking for large messages.

#### 2. Multiplexed Protocol on Single Channel

**Rejected**: Adds protocol complexity, doesn't solve backpressure isolation
issues.

#### 3. WebRTC DataChannels

**Rejected**: Not available in all environments (Web Workers), adds dependency
complexity.

#### 4. Shared Workers for Stream Management

**Rejected**: Limited browser support, unnecessary complexity for point-to-point
communication.

### Compatibility Impact

#### Phase 1 Preservation

- All existing Phase 1 RPC calls unchanged
- Main channel protocol identical to Phase 1
- No breaking changes to existing APIs
- Streaming is purely additive functionality

#### Migration Path

- **Gradual adoption**: Add streaming methods alongside existing RPC
- **Feature detection**: Clients can detect streaming support via protocol
  negotiation
- **Fallback compatibility**: Streaming methods can provide batch alternatives
- **Version negotiation**: Protocol version communicated during ready handshake

### Performance Characteristics

#### Benchmarking Targets (Phase 3)

- **Latency**: Stream data delivery within 1ms of main RPC calls
- **Throughput**: Handle 1000+ concurrent streams without performance
  degradation
- **Memory**: Per-stream overhead under 1KB, O(1) with number of streams
- **CPU**: Stream management under 5% CPU overhead vs. Phase 1

#### Expected Benefits

- **Reduced serialization**: Transferable objects eliminate JSON overhead
- **Better cache locality**: Stream processing code paths separated from RPC
- **Parallelism**: Stream and RPC processing can run on separate event loop
  ticks
- **Reduced GC pressure**: Shorter-lived objects in dedicated channels

### Security Considerations

#### Isolation Benefits

- **Stream containment**: Malicious stream data can't corrupt RPC protocol
- **Resource limits**: Per-stream credit limits prevent memory exhaustion
- **Independent validation**: Stream data validation separate from control
  messages
- **Clean shutdown**: Stream errors trigger isolated cleanup, not global state
  corruption

#### Trust Boundaries

- **Same-origin enforcement**: MessagePort transfer maintains same-origin policy
- **No privilege escalation**: Stream channels have same permissions as main RPC
- **Audit separation**: Stream and RPC operations logged independently
- **Error isolation**: Stream failures don't leak information to other streams

This separation architecture provides the foundation for scalable, efficient
streaming while maintaining the simplicity and reliability of the Phase 1 RPC
protocol.
