import type { Endpoint } from "./shared_types.ts";

// Helper: make an in-memory Endpoint using MessageChannel
export function memoryPair(): [Endpoint, Endpoint] {
  const mc = new MessageChannel();
  // Both ports are Endpoint-like; start them to ensure message delivery
  // deno-lint-ignore no-explicit-any
  const port1 = mc.port1 as any as Endpoint;
  // deno-lint-ignore no-explicit-any
  const port2 = mc.port2 as any as Endpoint;

  // Start ports to ensure message delivery
  if (port1.start) port1.start();
  if (port2.start) port2.start();

  return [port1, port2];
}

// Helper to close MessageChannel ports properly
export function closePorts(a: Endpoint, b: Endpoint) {
  // deno-lint-ignore no-explicit-any
  if ((a as any).close) (a as any).close();
  // deno-lint-ignore no-explicit-any
  if ((b as any).close) (b as any).close();
}
