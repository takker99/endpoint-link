import { assertEquals } from "@std/assert/equals";
import { post } from "./post.ts";
import { closePorts, memoryPair } from "./test_utils.ts";

Deno.test("post()", async (t) => {
  await t.step("handles transferables", async () => {
    const [a, b] = memoryPair();

    // Test with transferable array buffer
    const buf = new Uint8Array([1, 2, 3]).buffer;
    // deno-lint-ignore no-explicit-any
    let receivedData: any;

    // Set up listener before posting
    const cleanup = (() => {
      const controller = new AbortController();
      // deno-lint-ignore no-explicit-any
      const handler = (ev: any) => receivedData = ev.data;
      b.addEventListener("message", handler, { signal: controller.signal });
      return controller.abort.bind(controller);
    })();

    // Post with transferables
    post(a, { test: "data", buf }, [buf]);

    // Give it time to arrive
    await new Promise((resolve) => setTimeout(resolve, 10));

    assertEquals(receivedData?.test, "data");

    cleanup();
    closePorts(a, b);
  });

  await t.step("fallback when transferables fail", () => {
    // Create a mock endpoint that throws on postMessage with transferables
    const mockEndpoint = {
      // deno-lint-ignore no-explicit-any
      postMessage(_msg: any, transfer?: any) {
        if (transfer && transfer.length) {
          throw new Error("Transferables not supported");
        }
        // Success without transferables
      },
    };

    // Should not throw, should fallback to posting without transfer
    // deno-lint-ignore no-explicit-any
    post(mockEndpoint as any, { test: "data" }, [new ArrayBuffer(10)]);
  });
});
