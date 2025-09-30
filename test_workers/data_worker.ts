// deno-coverage-ignore-file
import { expose } from "../expose.ts";

const handlers = {
  processData(data: { items: number[] }, _signal?: AbortSignal) {
    return {
      sum: data.items.reduce((a, b) => a + b, 0),
      count: data.items.length,
      average: data.items.reduce((a, b) => a + b, 0) / data.items.length,
    };
  },
};

// deno-lint-ignore no-explicit-any
expose(self as any, handlers);
