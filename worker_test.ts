import { wrap } from "./wrap.ts";
import { assertEquals, assertRejects } from "@std/assert";

Deno.test("Worker integration without top-level await", async () => {
  const worker = new Worker(
    new URL("./test_workers/basic_worker.ts", import.meta.url).href,
    { type: "module" },
  );

  try {
    const api = await wrap<{
      add(a: number, b: number, signal?: AbortSignal): number;
      multiply(a: number, b: number, signal?: AbortSignal): number;
    }>(worker, { signal: AbortSignal.timeout(2000) });

    // Test basic functionality
    assertEquals(await api("add", [1, 2]), 3);
    assertEquals(await api("multiply", [3, 4]), 12);

    api[Symbol.dispose]();
  } finally {
    worker.terminate();
  }
});

Deno.test("Worker integration with simulated top-level await", async () => {
  const worker = new Worker(
    new URL("./test_workers/delayed_worker.ts", import.meta.url).href,
    { type: "module" },
  );

  try {
    const api = await wrap<{
      getMessage(signal?: AbortSignal): string;
      delayedTask(ms: number, signal?: AbortSignal): Promise<string>;
    }>(worker, { signal: AbortSignal.timeout(3000) });

    // Test basic functionality
    assertEquals(
      await api("getMessage", []),
      "Hello from worker with top-level await!",
    );

    // Test delayed task
    assertEquals(await api("delayedTask", [50]), "Task completed after 50ms");

    // Test cancellation
    const taskPromise = api("delayedTask", [200], {
      signal: AbortSignal.timeout(50),
    });

    await assertRejects(
      () => taskPromise,
      Error,
      "aborted",
    );

    api[Symbol.dispose]();
  } finally {
    worker.terminate();
  }
});

Deno.test("Worker readiness abort when worker fails to respond", async () => {
  const worker = new Worker(
    new URL("./test_workers/broken_worker.ts", import.meta.url).href,
    { type: "module" },
  );

  try {
    // Should abort since worker never sends ready signal
    await assertRejects(
      () =>
        wrap<Record<PropertyKey, never>>(worker, {
          signal: AbortSignal.timeout(500),
        }),
      Error,
      "aborted",
    );
  } finally {
    worker.terminate();
  }
});

Deno.test("Worker integration with error handling", async () => {
  const worker = new Worker(
    new URL("./test_workers/error_worker.ts", import.meta.url).href,
    { type: "module" },
  );

  try {
    const api = await wrap<{
      throwError(message: string, signal?: AbortSignal): never;
      throwNull(signal?: AbortSignal): never;
    }>(worker, { signal: AbortSignal.timeout(2000) });

    // Test error propagation
    await assertRejects(
      () => api("throwError", ["Test error"]),
      Error,
      "Test error",
    );

    // Test null error handling
    await assertRejects(
      () => api("throwNull", []),
      Error,
      "unknown",
    );

    api[Symbol.dispose]();
  } finally {
    worker.terminate();
  }
});

Deno.test("Worker integration with MessageChannel-style communication", async () => {
  const worker = new Worker(
    new URL("./test_workers/data_worker.ts", import.meta.url).href,
    { type: "module" },
  );

  try {
    const api = await wrap<{
      processData(data: { items: number[] }, signal?: AbortSignal): {
        sum: number;
        count: number;
        average: number;
      };
    }>(worker, { signal: AbortSignal.timeout(2000) });

    const result = await api("processData", [{ items: [1, 2, 3, 4, 5] }]);

    assertEquals(result.sum, 15);
    assertEquals(result.count, 5);
    assertEquals(result.average, 3);

    api[Symbol.dispose]();
  } finally {
    worker.terminate();
  }
});
