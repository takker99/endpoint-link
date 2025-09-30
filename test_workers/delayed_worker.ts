// deno-coverage-ignore-file
import { expose } from "../mod.ts";

// Simulate top-level await delay
await new Promise((resolve) => setTimeout(resolve, 100));

const handlers = {
  getMessage() {
    return "Hello from worker with top-level await!";
  },
  delayedTask(ms: number, signal?: AbortSignal) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => resolve(`Task completed after ${ms}ms`),
        ms,
      );
      signal?.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      });
    });
  },
};

// deno-lint-ignore no-explicit-any
expose(self as any, handlers);
