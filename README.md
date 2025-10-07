# endpoint-link

[![JSR](https://jsr.io/badges/@takker/endpoint-link)](https://jsr.io/@takker/endpoint-link)
[![codecov](https://codecov.io/gh/takker99/endpoint-link/branch/main/graph/badge.svg)](https://codecov.io/gh/takker99/endpoint-link)
[![test](https://github.com/takker99/endpoint-link/workflows/ci/badge.svg)](https://github.com/takker99/endpoint-link/actions?query=workflow%3Aci)

Lightweight type-safe RPC over MessagePort/Worker/BroadcastChannel.

## Features

- 🎯 **Type-safe**: Full TypeScript support with type inference
- 🪶 **Lightweight**: Minimal overhead, no Proxy usage
- 🔄 **Explicit control**: Clear separation of arguments and control options
- 🧹 **Resource management**: Automatic cleanup with `using` syntax
- ⚡ **Transfer support**: Explicit Transferable object handling

## Installation

```ts
import { expose, wrap } from "jsr:@takker/endpoint-link";
```

## Usage

### Basic RPC

```ts ignore
// Server side
const handlers = {
  add(a: number, b: number) {
    return a + b;
  },
  async fetchData(url: string) {
    const response = await fetch(url);
    return response.json();
  },
};

using disposable = expose(endpoint, handlers);

// Client side
using api = await wrap<typeof handlers>(otherEndpoint);

// Call remote procedures
const sum = await api("add", [1, 2]); // 3
const data = await api("fetchData", ["https://api.example.com"]);
```

### With AbortSignal

```ts ignore
const controller = new AbortController();

// Pass signal in options
const promise = api("longRunningTask", [1000], {
  signal: controller.signal,
});

// Cancel the operation
controller.abort();

await promise; // throws "aborted" error
```

### With Transferable Objects

```ts ignore
// Transfer ArrayBuffer ownership for better performance
const buffer = new ArrayBuffer(1024);
const result = await api("processBuffer", [buffer], {
  transfer: [buffer],
});

// buffer is now neutered (byteLength === 0)
console.log(buffer.byteLength); // 0
```

### Custom Timeout

```ts ignore
// Wait up to 3 seconds for endpoint to be ready
using api = await wrap<Handlers>(endpoint, { timeout: 3000 });
```

## Resource Management

Both `expose` and `wrap` return Disposable objects for automatic cleanup:

```ts ignore
{
  using disposable = expose(endpoint, handlers);
  using api = await wrap<Handlers>(endpoint);

  await api("method", []);

  // Automatically disposed when exiting the block
}

// Manual cleanup
const api = await wrap<Handlers>(endpoint);
api[Symbol.dispose]();

// After disposal, calls throw an error
await api("method", []); // throws "API has been disposed"
```

## API

### `wrap<Map>(endpoint, options?)`

Create a remote procedure caller.

- `endpoint`: MessagePort, Worker, or BroadcastChannel
- `options`: Optional configuration
  - `timeout`: Milliseconds to wait for readiness (default: 5000)

Returns a callable function with signature:

```ts ignore
<Name>(name: Name, args: Parameters<Map[Name]>, options?: RemoteProcedureOptions)
```

### `expose<Map>(endpoint, handlers)`

Register handlers on an endpoint.

- `endpoint`: MessagePort, Worker, or BroadcastChannel
- `handlers`: Object mapping names to handler functions

Returns a Disposable for cleanup.

### `RemoteProcedureOptions`

```ts ignore
interface RemoteProcedureOptions {
  transfer?: Transferable[]; // Objects to transfer
  signal?: AbortSignal; // Cancellation signal
}
```

## Migration from v0.x

```ts ignore
// Before
const api = await wrap<Handlers>(endpoint, ["add", "mul"]);
await api.add(1, 2);
await api.mul(2, 3, abortSignal);
api.close();

// After
const api = await wrap<Handlers>(endpoint);
await api("add", [1, 2]);
await api("mul", [2, 3], { signal: abortSignal });
api[Symbol.dispose]();
```

## License

MIT
