import type { Endpoint } from "./shared_types.ts";
import { on } from "./on.ts";

/**
 * Wait for an endpoint to signal it's ready before making calls.
 *
 * @param endpoint The endpoint to wait for readiness signal from.
 * @param timeoutMs Timeout in milliseconds before rejecting. Defaults to 5000ms.
 * @returns Promise that resolves when endpoint signals ready or rejects on timeout.
 */
export const waitForReady = (
  endpoint: Endpoint,
  timeoutMs = 5000,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Endpoint readiness timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = on(endpoint, (data) => {
      if (data && data.kind === "ready") {
        clearTimeout(timeoutId);
        cleanup();
        resolve();
      }
    });
  });
