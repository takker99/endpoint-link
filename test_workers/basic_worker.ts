// deno-coverage-ignore-file
import { expose } from "../expose.ts";

const handlers = {
  add(a: number, b: number, _signal?: AbortSignal) {
    return a + b;
  },
  multiply(a: number, b: number, _signal?: AbortSignal) {
    return a * b;
  },
};

// deno-lint-ignore no-explicit-any
expose(self as any, handlers);
