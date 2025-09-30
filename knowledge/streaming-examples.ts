// Phase 2 Streaming Examples and Pseudo-code
// These examples demonstrate the proposed streaming API design
// deno-lint-ignore-file no-unused-vars no-explicit-any require-await

import type { Endpoint } from "../shared_types.ts";
import type {
  BackpressureOptions,
  StreamDirection,
  StreamOpenMsg,
} from "./streaming-protocol.ts";

// ============================================================================
// EXAMPLE 1: Unidirectional Streaming (Server → Client)
// ============================================================================

/**
 * Server-side handler that streams numbers
 */
const numberStreamHandlers = {
  // Generator function indicates streaming return
  async *generateNumbers(
    count: number,
    interval: number = 100,
    signal?: AbortSignal,
  ): AsyncGenerator<number, void, unknown> {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) {
        throw new Error("aborted");
      }

      yield i;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  },

  // Mixed handler: streaming + regular RPC
  async *readFile(
    path: string,
    chunkSize: number = 8192,
    signal?: AbortSignal,
  ): AsyncGenerator<Uint8Array, void, unknown> {
    // Pseudo-code for file reading
    const file = await openFile(path);
    try {
      while (!file.eof) {
        if (signal?.aborted) break;

        const chunk = await file.read(chunkSize);
        yield chunk; // Each chunk transferred efficiently
      }
    } finally {
      await file.close();
    }
  },

  // Regular RPC method (non-streaming)
  async getFileInfo(path: string, signal?: AbortSignal) {
    return { size: 12345, modified: new Date() };
  },
};

/**
 * Client-side usage of streaming API
 */
async function clientStreamingExample(endpoint: Endpoint) {
  const api = await wrap<typeof numberStreamHandlers>(
    endpoint,
    ["generateNumbers", "readFile", "getFileInfo"],
  );

  // Streaming usage
  console.log("Streaming numbers:");
  const numberStream = api.generateNumbers(5, 200);

  for await (const number of numberStream) {
    console.log(`Received: ${number}`);
  }

  // File streaming with backpressure
  console.log("Streaming file chunks:");
  const fileStream = api.readFile("/large-file.bin", 8192);

  const chunks: Uint8Array[] = [];
  for await (const chunk of fileStream) {
    chunks.push(chunk);
    console.log(`Chunk size: ${chunk.byteLength}`);
  }

  // Regular RPC (unchanged)
  const fileInfo = await api.getFileInfo("/large-file.bin");
  console.log("File info:", fileInfo);
}

// ============================================================================
// EXAMPLE 2: Bidirectional Streaming
// ============================================================================

/**
 * Echo service with bidirectional streaming
 */
const echoHandlers = {
  // Bidirectional streaming: AsyncIterable input, AsyncGenerator output
  async *echo(
    input: AsyncIterable<string>,
    prefix: string = "Echo",
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    for await (const message of input) {
      if (signal?.aborted) break;

      yield `${prefix}: ${message}`;
    }
  },

  // Transform stream with backpressure
  async *transform(
    input: AsyncIterable<number>,
    operation: "double" | "square" = "double",
    signal?: AbortSignal,
  ): AsyncGenerator<number, void, unknown> {
    for await (const num of input) {
      if (signal?.aborted) break;

      const result = operation === "double" ? num * 2 : num * num;
      yield result;
    }
  },
};

/**
 * Client with bidirectional streaming
 */
async function bidirectionalExample(endpoint: Endpoint) {
  const api = await wrap<typeof echoHandlers>(
    endpoint,
    ["echo", "transform"],
  );

  // Create client stream
  async function* clientMessages() {
    const messages = ["Hello", "World", "Streaming", "Works"];
    for (const msg of messages) {
      yield msg;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  // Bidirectional streaming
  const echoStream = api.echo(clientMessages(), "Server");

  for await (const response of echoStream) {
    console.log(`Received: ${response}`);
  }

  // Number transformation stream
  async function* numbers() {
    for (let i = 1; i <= 10; i++) {
      yield i;
    }
  }

  const transformStream = api.transform(numbers(), "square");

  for await (const squared of transformStream) {
    console.log(`Squared: ${squared}`);
  }
}

// ============================================================================
// EXAMPLE 3: Advanced Streaming with Custom Backpressure
// ============================================================================

/**
 * Large data streaming with custom backpressure configuration
 */
const dataStreamHandlers = {
  // Stream large objects with byte-based backpressure
  async *streamLargeData(
    count: number,
    signal?: AbortSignal,
  ): AsyncGenerator<ArrayBuffer, void, unknown> {
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;

      // Create large buffer (1MB each)
      const buffer = new ArrayBuffer(1024 * 1024);
      const view = new Uint8Array(buffer);
      view.fill(i % 256); // Fill with pattern

      yield buffer; // Transferred efficiently
    }
  },

  // Controlled streaming with custom sizing
  async *controlledStream(
    data: any[],
    signal?: AbortSignal,
  ): AsyncGenerator<any, void, unknown> {
    for (const item of data) {
      if (signal?.aborted) break;
      yield item;
    }
  },
};

/**
 * Advanced streaming configuration
 */
async function advancedStreamingExample(endpoint: Endpoint) {
  // Custom backpressure options for byte-intensive streams
  const byteStreamOptions: BackpressureOptions = {
    highWaterMark: 8 * 1024 * 1024, // 8MB buffer
    sizeFunction: "bytes", // Use byte-based credit calculation
  };

  const api = await wrapWithOptions<typeof dataStreamHandlers>(
    endpoint,
    ["streamLargeData", "controlledStream"],
    { backpressure: byteStreamOptions },
  );

  // Handle large data streams efficiently
  const largeDataStream = api.streamLargeData(10);

  let totalBytes = 0;
  for await (const buffer of largeDataStream) {
    totalBytes += buffer.byteLength;
    console.log(
      `Received buffer: ${buffer.byteLength} bytes (total: ${totalBytes})`,
    );

    // Process buffer without blocking sender due to backpressure
    await processLargeBuffer(buffer);
  }
}

// ============================================================================
// EXAMPLE 4: Error Handling and Cancellation
// ============================================================================

const resilientHandlers = {
  async *unstableStream(
    errorRate: number = 0.1,
    signal?: AbortSignal,
  ): AsyncGenerator<number, void, unknown> {
    let count = 0;

    while (count < 100) {
      if (signal?.aborted) {
        console.log("Stream cancelled gracefully");
        return;
      }

      // Simulate occasional errors
      if (Math.random() < errorRate) {
        throw new Error(`Simulated error at count ${count}`);
      }

      yield count++;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  },

  async *recoverableStream(
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, unknown> {
    try {
      yield "Starting";
      yield "Processing";

      // Simulate processing that might fail
      await riskyOperation();

      yield "Completed";
    } catch (error) {
      // Stream can handle errors gracefully
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      yield `Error occurred: ${errorMessage}`;
      yield "Recovered";
    }
  },
};

/**
 * Error handling and cancellation examples
 */
async function errorHandlingExample(endpoint: Endpoint) {
  const api = await wrap<typeof resilientHandlers>(
    endpoint,
    ["unstableStream", "recoverableStream"],
  );

  // Handle streaming errors
  try {
    const unstableStream = api.unstableStream(0.2); // 20% error rate

    for await (const value of unstableStream) {
      console.log(`Received: ${value}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`Stream failed: ${errorMessage}`);
  }

  // Cancellation with AbortController
  const controller = new AbortController();

  // Cancel after 1 second
  setTimeout(() => {
    console.log("Cancelling stream...");
    controller.abort();
  }, 1000);

  try {
    const cancelableStream = api.unstableStream(0, controller.signal);

    for await (const value of cancelableStream) {
      console.log(`Received before cancel: ${value}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "aborted") {
      console.log("Stream was cancelled successfully");
    }
  }

  // Recoverable stream
  const recoverableStream = api.recoverableStream();

  for await (const message of recoverableStream) {
    console.log(`Recovery stream: ${message}`);
  }
}

// ============================================================================
// PSEUDO-CODE: Internal Implementation Concepts
// ============================================================================

/**
 * Pseudo-code for wrap() streaming extension
 */
interface StreamingWrapImplementation {
  // Detect if handler returns AsyncIterable/AsyncGenerator
  isStreamingMethod(handler: any): boolean;

  // Create MessageChannel pair for stream
  createStreamChannel(streamId: string): [MessagePort, MessagePort];

  // Set up credit tracking for backpressure
  initializeCreditTracking(
    streamId: string,
    options: BackpressureOptions,
  ): CreditTracker;

  // Handle stream data flow
  processStreamData(
    streamId: string,
    data: any,
    port: MessagePort,
  ): Promise<void>;

  // Manage stream lifecycle
  cleanupStream(streamId: string): void;
}

/**
 * Pseudo-code for expose() streaming extension
 */
interface StreamingExposeImplementation {
  // Handle stream-open messages
  handleStreamOpen(msg: StreamOpenMsg): Promise<void>;

  // Process streaming handler results
  handleStreamingResult(
    callId: string,
    result: AsyncIterable<any>,
    signal: AbortSignal,
  ): Promise<void>;

  // Send stream data with backpressure
  sendStreamData(
    streamId: string,
    value: any,
    port: MessagePort,
  ): Promise<void>;

  // Manage credit and flow control
  updateCreditAndSend(
    streamId: string,
    creditTracker: CreditTracker,
  ): void;
}

// ============================================================================
// UTILITY TYPES AND HELPERS
// ============================================================================

/**
 * Type helpers for streaming detection
 */
type IsAsyncIterable<T> = T extends AsyncIterable<infer U> ? U : never;
type IsAsyncGenerator<T> = T extends AsyncGenerator<infer U> ? U : never;

/**
 * Credit tracking state
 */
interface CreditTracker {
  available: number;
  highWaterMark: number;
  sizeFunction: (data: any) => number;
  pendingCredits: number;
}

/**
 * Mock functions for examples
 */
declare function wrap<H>(
  endpoint: Endpoint,
  methods: (keyof H)[],
): Promise<StreamingApi<H>>;

declare function wrapWithOptions<H>(
  endpoint: Endpoint,
  methods: (keyof H)[],
  options: { backpressure?: BackpressureOptions },
): Promise<StreamingApi<H>>;

declare function openFile(path: string): Promise<any>;
declare function processLargeBuffer(buffer: ArrayBuffer): Promise<void>;
declare function riskyOperation(): Promise<void>;

type StreamingApi<H> = {
  [K in keyof H]: H[K] extends (...args: infer A) => AsyncIterable<infer T>
    ? (...args: A) => AsyncIterable<T>
    : H[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<R>
    : never;
};
