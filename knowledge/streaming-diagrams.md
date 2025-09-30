# Phase 2 Streaming Protocol Diagrams

## Stream State Machine

```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> OPENING : stream-open sent
    OPENING --> ACTIVE : port established
    ACTIVE --> ACTIVE : stream-data/stream-credit
    ACTIVE --> CLOSING : stream-end
    ACTIVE --> CLOSING : stream-error  
    ACTIVE --> CLOSING : stream-cancel
    CLOSING --> CLOSED : cleanup complete
    CLOSED --> [*]
    
    note right of ACTIVE
        Backpressure loop:
        - Check credit before send
        - Consume credit on receive
        - Replenish via stream-credit
    end note
```

## Sequence Diagrams

### Unidirectional Streaming (Server → Client)

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant SC as Stream Channel
    
    Note over C,S: RPC Call Setup
    C->>S: call("streamData")
    S->>C: stream-open(port, streamId)
    
    Note over C,SC: Dedicated Stream Channel
    S->>SC: stream-data(value1, credit=15)
    SC->>C: stream-credit(5)
    S->>SC: stream-data(value2, credit=14)
    S->>SC: stream-data(value3, credit=13)
    SC->>C: stream-credit(10)
    
    Note over S,SC: Stream Completion
    S->>SC: stream-data(finalValue, done=true)
    S->>SC: stream-end()
    
    Note over C,S: RPC Completion
    S->>C: result(success)
```

### Bidirectional Streaming

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant SC as Stream Channel
    
    Note over C,S: RPC Call Setup
    C->>S: call("echo", inputStream)
    S->>C: stream-open(port, streamId, "bidirectional")
    
    Note over C,SC: Bidirectional Stream Data
    C->>SC: stream-data("Hello", credit=15)
    S->>SC: stream-data("Echo: Hello", credit=15)
    
    C->>SC: stream-data("World", credit=14)
    S->>SC: stream-data("Echo: World", credit=14)
    
    Note over C,SC: Credit Management
    SC->>C: stream-credit(5)
    SC->>S: stream-credit(5)
    
    Note over C,SC: Stream Completion
    C->>SC: stream-data(done=true)
    S->>SC: stream-data(done=true)
    S->>SC: stream-end()
    
    Note over C,S: RPC Completion
    S->>C: result(success)
```

### Error Handling in Streams

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant SC as Stream Channel
    
    Note over C,S: Normal Stream Start
    C->>S: call("processStream")
    S->>C: stream-open(port, streamId)
    
    Note over S,SC: Processing Data
    S->>SC: stream-data(data1)
    S->>SC: stream-data(data2)
    
    Note over S,SC: Error Occurs
    S->>SC: stream-error("Processing failed")
    S->>SC: stream-end()
    
    Note over C,S: RPC Error Response
    S->>C: result(error="Stream processing failed")
```

### Cancellation Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant SC as Stream Channel
    
    Note over C,S: Stream in Progress
    C->>S: call("longStream")
    S->>C: stream-open(port, streamId)
    S->>SC: stream-data(data1)
    S->>SC: stream-data(data2)
    
    Note over C,S: Client Cancellation
    C->>S: cancel(callId)
    S->>SC: stream-cancel()
    
    Note over S,SC: Cleanup
    S->>SC: stream-end()
    
    Note over C,S: RPC Cancellation Response
    S->>C: result(error="aborted")
```

## Backpressure Flow Control

### Credit Management Flow

```mermaid
flowchart TD
    A[Sender wants to send data] --> B{Credit >= sizeFunction(data)?}
    B -->|Yes| C[Send stream-data]
    B -->|No| D[Wait for stream-credit]
    
    C --> E[Receiver processes data]
    E --> F[Update available credit]
    F --> G{Credit < highWaterMark / 2?}
    G -->|Yes| H[Send stream-credit]
    G -->|No| I[Continue processing]
    
    D --> J[Receive stream-credit]
    J --> K[Update sender credit]
    K --> B
    
    H --> L[Sender receives credit]
    L --> K
```

### Size Function Strategies

```mermaid
flowchart LR
    A[Data Item] --> B{Size Strategy}
    B -->|"items"| C[Credit = 1]
    B -->|"bytes"| D[Credit = byteLength]
    B -->|Custom Function| E[Credit = fn(data)]
    
    C --> F[Simple counting]
    D --> G[Memory-based]
    E --> H[Domain-specific]
```

## Resource Management

### Stream Lifecycle Management

```mermaid
flowchart TD
    A[RPC Call with streaming return] --> B[Create MessageChannel pair]
    B --> C[Send stream-open with port]
    C --> D[Initialize stream state]
    
    D --> E[Active streaming]
    E --> F{Stream complete?}
    F -->|Normal end| G[Send stream-end]
    F -->|Error| H[Send stream-error]
    F -->|Cancel| I[Send stream-cancel]
    
    G --> J[Close MessagePort]
    H --> J
    I --> J
    
    J --> K[Clean up stream state]
    K --> L[Send RPC result]
```

### Memory Management

```mermaid
flowchart TD
    A[Stream Data Received] --> B[Calculate credit consumption]
    B --> C[Update available credit]
    C --> D{Credit < threshold?}
    
    D -->|Yes| E[Send stream-credit]
    D -->|No| F[Buffer data]
    
    E --> G[Allow sender to continue]
    F --> H{Buffer full?}
    H -->|Yes| I[Apply backpressure]
    H -->|No| F
    
    I --> J[Process buffered data]
    J --> C
```

## Error Recovery Patterns

### Graceful Degradation

```mermaid
flowchart TD
    A[Streaming RPC Call] --> B{Streaming supported?}
    B -->|Yes| C[Use streaming protocol]
    B -->|No| D[Fallback to batch RPC]
    
    C --> E{Stream error?}
    E -->|Yes| F[Attempt recovery]
    E -->|No| G[Continue streaming]
    
    F --> H{Recovery successful?}
    H -->|Yes| G
    H -->|No| I[Fallback to batch]
    
    D --> J[Collect all data]
    I --> J
    J --> K[Send as single result]
```

These diagrams provide visual representation of the streaming protocol behavior,
state transitions, and flow control mechanisms specified in the Phase 2 design.
