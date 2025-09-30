import { assertEquals } from "@std/assert/equals";
import { isAbortSignal } from "./is_abort_signal.ts";

Deno.test("isAbortSignal()", () => {
  const ac = new AbortController();
  assertEquals(isAbortSignal(ac.signal), true);
  assertEquals(isAbortSignal({}), false);
  assertEquals(isAbortSignal(null), false);
  assertEquals(isAbortSignal(undefined), false);
  assertEquals(isAbortSignal({ aborted: true }), false); // Missing addEventListener
});
