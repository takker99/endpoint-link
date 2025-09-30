// Phase 2 streaming protocol frames (design spec - not for implementation)
// This file documents the proposed streaming protocol extension for Phase 2
// deno-lint-ignore-file no-unused-vars no-explicit-any

// Import Phase 1 frames
import type {
  CallMsg,
  CancelMsg,
  Msg as Phase1Msg,
  ReadyMsg,
  ResultMsg,
} from "../protocol.ts";

// Phase 2 streaming frame definitions

/**
 * Stream initialization frame sent on main RPC channel
 * Creates a dedicated MessagePort pair for stream data
 */
export type StreamOpenMsg = {
  id: string; // RPC call ID that initiated this stream
  kind: "stream-open";
  streamId: string; // Unique identifier for this stream
  port: MessagePort; // Dedicated channel for stream data/credit messages
  direction: "send" | "receive" | "bidirectional";

  // Backpressure configuration
  highWaterMark?: number; // Default: 16
  sizeFunction?: "bytes" | "items"; // Default: "items"
};

/**
 * Data frame sent on dedicated stream MessagePort
 * Contains actual streaming data with flow control
 */
export type StreamDataMsg = {
  streamId: string;
  kind: "stream-data";
  value: any; // The actual data being streamed
  done?: boolean; // True for final chunk (equivalent to generator return)
  transfer?: Transferable[]; // Transferable objects to transfer ownership
};

/**
 * Credit replenishment frame sent on dedicated stream MessagePort
 * Allows sender to resume sending after backpressure
 */
export type StreamCreditMsg = {
  streamId: string;
  kind: "stream-credit";
  credit: number; // Additional credit units available for sender
};

/**
 * Clean stream termination frame
 * Sent when stream completes normally
 */
export type StreamEndMsg = {
  streamId: string;
  kind: "stream-end";
};

/**
 * Stream error frame
 * Sent when stream encounters an error
 */
export type StreamErrorMsg = {
  streamId: string;
  kind: "stream-error";
  error: string; // Serialized error message
};

/**
 * Stream cancellation frame
 * Sent to abort stream immediately
 */
export type StreamCancelMsg = {
  streamId: string;
  kind: "stream-cancel";
};

// Stream-specific message union (for dedicated stream MessagePorts)
export type StreamMsg =
  | StreamDataMsg
  | StreamCreditMsg
  | StreamEndMsg
  | StreamErrorMsg
  | StreamCancelMsg;

// Complete Phase 2 message union (for main RPC channel)
export type Phase2Msg =
  | CallMsg
  | ResultMsg
  | CancelMsg
  | ReadyMsg
  | StreamOpenMsg;

/**
 * Stream state machine states
 */
export enum StreamState {
  IDLE = "idle",
  OPENING = "opening",
  ACTIVE = "active",
  CLOSING = "closing",
  CLOSED = "closed",
}

/**
 * Stream metadata for tracking
 */
export interface StreamInfo {
  id: string;
  state: StreamState;
  direction: "send" | "receive" | "bidirectional";
  port: MessagePort;

  // Flow control state
  credit: number;
  highWaterMark: number;
  sizeFunction: (data: any) => number;

  // Cleanup handlers
  cleanup?: () => void;
}

/**
 * Backpressure configuration options
 */
export interface BackpressureOptions {
  /**
   * Maximum number of credit units before backpressure is applied
   * @default 16
   */
  highWaterMark?: number;

  /**
   * Strategy for calculating credit consumption per data item
   * - "items": 1 credit per data item (default)
   * - "bytes": Credit equals byte size (for ArrayBuffer/TypedArray)
   * @default "items"
   */
  sizeFunction?: "items" | "bytes" | ((data: any) => number);
}

/**
 * Stream direction capabilities
 */
export type StreamDirection = "send" | "receive" | "bidirectional";

// Re-export everything as Phase 2 protocol
export type Msg = Phase2Msg;
