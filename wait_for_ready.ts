import type { Endpoint } from "./shared_types.ts";
import { on } from "./on.ts";

/**
 * Wait for an endpoint to signal it's ready before making calls.
 *
 * @param endpoint The endpoint to wait for readiness signal from.
 * @param signal Optional abort signal to cancel waiting.
 * @returns Promise that resolves when endpoint signals ready or rejects if aborted.
 */
export const waitForReady = (
  endpoint: Endpoint,
  signal?: AbortSignal,
): Promise<void> =>
  new Promise((resolve, reject) => {
    // Check if already aborted
    if (signal?.aborted) {
      reject(new Error("aborted"));
      return;
    }

    const cleanup = on(endpoint, (data) => {
      if (data && data.kind === "ready") {
        removeAbortListener();
        cleanup();
        resolve();
      }
    });

    let removeAbortListener: () => void = () => {};
    if (signal) {
      const abortHandler = () => {
        cleanup();
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", abortHandler, { once: true });
      removeAbortListener = () => {
        try {
          signal.removeEventListener("abort", abortHandler);
        } catch {
          // Ignore cleanup errors
        }
      };
    }
  });
