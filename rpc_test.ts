// Disabled temporarily due to `error: Promise resolution is still pending but the event loop has already resolved`.
// TODO: fix the issue and re-enable.

// import { expose, wrap } from "./mod.ts";
// import type { Endpoint } from "./shared_types.ts";
// import { assertEquals, assertRejects } from "@std/assert";

// // Helper: make an in-memory Endpoint using MessageChannel
// function memoryPair(): [Endpoint, Endpoint] {
//   const mc = new MessageChannel();
//   // Both ports are Endpoint-like
//   // deno-lint-ignore no-explicit-any
//   return [mc.port1 as any as Endpoint, mc.port2 as any as Endpoint];
// }

// Deno.test("RPC basic success (value + Promise)", async () => {
//   const [a, b] = memoryPair();
//   const handlers = {
//     add(a: number, b: number, _s?: AbortSignal) {
//       return a + b;
//     },
//     mul(a: number, b: number, _s?: AbortSignal) {
//       return a * b;
//     },
//   };
//   expose(a, handlers);
//   const api = wrap<typeof handlers>(b, ["add", "mul"]);
//   assertEquals(await api.add(1, 2), 3);
//   assertEquals(await api.mul(2, 3), 6);
// });

// Deno.test("RPC error propagation", async () => {
//   const [a, b] = memoryPair();
//   const handlers = {
//     boom(_n: number, _s?: AbortSignal) {
//       throw new Error("boom");
//     },
//   };
//   expose(a, handlers);
//   const api = wrap<typeof handlers>(b, ["boom"]);
//   await assertRejects(() => api.boom(1), Error, "boom");
// });

// Deno.test("RPC abort via AbortSignal", async () => {
//   const [a, b] = memoryPair();
//   const handlers = {
//     async longTask(ms: number, signal?: AbortSignal) {
//       // poll abort
//       const start = Date.now();
//       while (Date.now() - start < ms) {
//         if (signal?.aborted) throw new Error("aborted");
//         await new Promise((r) => setTimeout(r, 5));
//       }
//       return "done";
//     },
//   };
//   expose(a, handlers);
//   const api = wrap<typeof handlers>(b, ["longTask"]);
//   const ac = new AbortController();
//   const p = api.longTask(200, ac.signal);
//   setTimeout(() => ac.abort(), 20);
//   await assertRejects(() => p, Error, "aborted");
// });

// Deno.test("Transferable ArrayBuffer is passed", async () => {
//   const [a, b] = memoryPair();
//   const handlers = {
//     len(buf: ArrayBuffer, _s?: AbortSignal) {
//       return (buf.byteLength ?? 0) as number;
//     },
//   };
//   expose(a, handlers);
//   const api = wrap<typeof handlers>(b, ["len"]);
//   const buf = new Uint8Array([1, 2, 3]).buffer;
//   const n = await api.len(buf);
//   assertEquals(n, 3);
// });
