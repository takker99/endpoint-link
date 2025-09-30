// deno-coverage-ignore-file
import { expose } from "../mod.ts";

const handlers = {
  throwError(message: string, _signal?: AbortSignal) {
    throw new Error(message);
  },
  throwNull(_signal?: AbortSignal) {
    throw null;
  },
};

// deno-lint-ignore no-explicit-any
expose(self as any, handlers);
