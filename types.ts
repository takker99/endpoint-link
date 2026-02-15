// Phase 1 type helpers: non-stream RPC only.

/** A function that can be called remotely */
// deno-lint-ignore no-explicit-any
export type RemoteProcedureFunction = (...args: any[]) => any;

/** Map of remote procedure names to their implementations */
export type RemoteProcedureMap = Record<string, RemoteProcedureFunction>;

/** Options for remote procedure calls */
export interface RemoteProcedureOptions {
  /** Transferable objects to transfer ownership (e.g., ArrayBuffer, MessagePort) */
  transfer?: Transferable[];
  /** Signal to abort the operation */
  signal?: AbortSignal;
}

/** Options for wrap function */
export interface WrapOptions {
  /** Signal to abort waiting for endpoint readiness */
  signal?: AbortSignal;
  /** Custom handler for message deserialization errors */
  onMessageError?: (ev: MessageEvent) => void;
}

/** Options for expose function */
export interface ExposeOptions {
  /** Custom handler for message deserialization errors */
  onMessageError?: (ev: MessageEvent) => void;
}

/** Remote return type - always wrapped in Promise */
export type RemoteReturnType<T> = Promise<Awaited<T>>;

/**
 * Remote procedure call interface.
 * Call remote functions with explicit argument arrays and options.
 * Implements Disposable for automatic cleanup with `using` syntax.
 */
export interface RemoteProcedure<Map extends RemoteProcedureMap>
  extends Disposable {
  /**
   * Call a remote procedure
   * @param name Name of the remote function
   * @param args Arguments as an array
   * @param options Transfer and signal options
   * @returns Promise resolving to the function's return value
   */
  <Name extends keyof Map>(
    name: Name,
    args: Parameters<Map[Name]>,
    options?: RemoteProcedureOptions,
  ): RemoteReturnType<ReturnType<Map[Name]>>;
}

/**
 * Disposable object returned by expose() for resource cleanup.
 * Implements Disposable for use with `using` syntax.
 */
export type ExposeDisposable = Disposable;
