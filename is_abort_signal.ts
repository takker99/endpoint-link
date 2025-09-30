// deno-lint-ignore no-explicit-any
export const isAbortSignal = (x: any): x is AbortSignal => {
  return !!x && typeof x === "object" && "aborted" in x &&
    // deno-lint-ignore no-explicit-any
    typeof (x as any).addEventListener === "function";
};
