import { expose, wrap, waitForReady } from "./mod.ts";
import { assertEquals, assertRejects } from "@std/assert";

// Create a worker script dynamically for testing
function createWorkerScript(code: string): string {
  const blob = new Blob([code], { type: "application/typescript" });
  return URL.createObjectURL(blob);
}

Deno.test("Worker integration without top-level await", async () => {
  const workerScript = createWorkerScript(`
    import { expose } from "${import.meta.resolve("./mod.ts")}";
    
    const handlers = {
      add(a: number, b: number, _signal?: AbortSignal) {
        return a + b;
      },
      multiply(a: number, b: number, _signal?: AbortSignal) {
        return a * b;
      }
    };
    
    expose(self, handlers);
  `);

  const worker = new Worker(workerScript, { type: "module" });
  
  try {
    // Wait for worker to be ready
    await waitForReady(worker, 2000);
    
    const api = wrap<{
      add(a: number, b: number, signal?: AbortSignal): number;
      multiply(a: number, b: number, signal?: AbortSignal): number;
    }>(worker, ["add", "multiply"]);

    // Test basic functionality
    assertEquals(await api.add(1, 2), 3);
    assertEquals(await api.multiply(3, 4), 12);
    
    api.close();
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerScript);
  }
});

Deno.test("Worker integration with simulated top-level await", async () => {
  const workerScript = createWorkerScript(`
    import { expose } from "${import.meta.resolve("./mod.ts")}";
    
    // Simulate top-level await delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const handlers = {
      getMessage() {
        return "Hello from worker with top-level await!";
      },
      delayedTask(ms: number, signal?: AbortSignal) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve(\`Task completed after \${ms}ms\`), ms);
          signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('aborted'));
          });
        });
      }
    };
    
    expose(self, handlers);
  `);

  const worker = new Worker(workerScript, { type: "module" });
  
  try {
    // Wait for worker to be ready (should handle the top-level await delay)
    await waitForReady(worker, 3000);
    
    const api = wrap<{
      getMessage(signal?: AbortSignal): string;
      delayedTask(ms: number, signal?: AbortSignal): Promise<string>;
    }>(worker, ["getMessage", "delayedTask"]);

    // Test basic functionality
    assertEquals(await api.getMessage(), "Hello from worker with top-level await!");
    
    // Test delayed task
    assertEquals(await api.delayedTask(50), "Task completed after 50ms");
    
    // Test cancellation
    const controller = new AbortController();
    const taskPromise = api.delayedTask(200, controller.signal);
    setTimeout(() => controller.abort(), 50);
    
    await assertRejects(
      () => taskPromise,
      Error,
      "aborted"
    );
    
    api.close();
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerScript);
  }
});

Deno.test("Worker readiness timeout when worker fails to respond", async () => {
  const workerScript = createWorkerScript(`
    // Worker that never calls expose, simulating a broken worker
    console.log("Worker started but never calls expose");
  `);

  const worker = new Worker(workerScript, { type: "module" });
  
  try {
    // Should timeout since worker never sends ready signal
    await assertRejects(
      () => waitForReady(worker, 500),
      Error,
      "Endpoint readiness timeout after 500ms"
    );
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerScript);
  }
});

Deno.test("Worker integration with error handling", async () => {
  const workerScript = createWorkerScript(`
    import { expose } from "${import.meta.resolve("./mod.ts")}";
    
    const handlers = {
      throwError(message: string, _signal?: AbortSignal) {
        throw new Error(message);
      },
      throwNull(_signal?: AbortSignal) {
        throw null;
      }
    };
    
    expose(self, handlers);
  `);

  const worker = new Worker(workerScript, { type: "module" });
  
  try {
    await waitForReady(worker, 2000);
    
    const api = wrap<{
      throwError(message: string, signal?: AbortSignal): never;
      throwNull(signal?: AbortSignal): never;
    }>(worker, ["throwError", "throwNull"]);

    // Test error propagation
    await assertRejects(
      () => api.throwError("Test error"),
      Error,
      "Test error"
    );
    
    // Test null error handling
    await assertRejects(
      () => api.throwNull(),
      Error,
      "unknown"
    );
    
    api.close();
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerScript);
  }
});

Deno.test("Worker integration with MessageChannel-style communication", async () => {
  const workerScript = createWorkerScript(`
    import { expose } from "${import.meta.resolve("./mod.ts")}";
    
    const handlers = {
      processData(data: { items: number[] }, _signal?: AbortSignal) {
        return {
          sum: data.items.reduce((a, b) => a + b, 0),
          count: data.items.length,
          average: data.items.reduce((a, b) => a + b, 0) / data.items.length
        };
      }
    };
    
    expose(self, handlers);
  `);

  const worker = new Worker(workerScript, { type: "module" });
  
  try {
    await waitForReady(worker, 2000);
    
    const api = wrap<{
      processData(data: { items: number[] }, signal?: AbortSignal): {
        sum: number;
        count: number; 
        average: number;
      };
    }>(worker, ["processData"]);

    const result = await api.processData({ items: [1, 2, 3, 4, 5] });
    
    assertEquals(result.sum, 15);
    assertEquals(result.count, 5);
    assertEquals(result.average, 3);
    
    api.close();
  } finally {
    worker.terminate();
    URL.revokeObjectURL(workerScript);
  }
});