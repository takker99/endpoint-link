import { assertEquals } from "@std/assert";
import { on, onMessageError } from "./on.ts";
import { memoryPair } from "./test_utils.ts";

Deno.test("on() attaches message listener", async () => {
  using pair = memoryPair();
  const { port1: a, port2: b } = pair;
  let received = false;

  const remove = on(a, (data) => {
    received = true;
    assertEquals(data, "test");
  });

  // Wait a bit to let listener attach
  await new Promise((resolve) => setTimeout(resolve, 10));

  b.postMessage("test");

  // Wait for async message
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(received, true);
  remove();
});

Deno.test("onMessageError() attaches messageerror listener", async () => {
  using pair = memoryPair();
  const { port1: a } = pair;
  let errorReceived = false;

  const remove = onMessageError(a, (ev) => {
    errorReceived = true;
    assertEquals(ev.type, "messageerror");
  });

  // Wait a bit to let listener attach
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Trigger a messageerror by dispatching the event
  // Note: In practice, messageerror is triggered by the browser/runtime
  // when deserialization fails
  const event = new MessageEvent("messageerror", {
    data: null,
  });
  // deno-lint-ignore no-explicit-any
  (a as any).dispatchEvent?.(event);

  // Wait for async event
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(errorReceived, true);
  remove();
});

Deno.test("on() remove function stops listening", async () => {
  using pair = memoryPair();
  const { port1: a, port2: b } = pair;
  let count = 0;

  const remove = on(a, () => {
    count++;
  });

  // Wait a bit to let listener attach
  await new Promise((resolve) => setTimeout(resolve, 10));

  b.postMessage("test1");

  // Wait for first message
  await new Promise((resolve) => setTimeout(resolve, 10));

  remove();

  b.postMessage("test2");

  // Wait a bit to ensure second message doesn't arrive
  await new Promise((resolve) => setTimeout(resolve, 10));

  assertEquals(count, 1);
});
