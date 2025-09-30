// Phase 1 type helpers: non-stream RPC only.
// Sender->Receiver: sender may pass T | Promise<T>; receiver receives T
// Receiver->Sender: receiver may return T | Promise<T>; sender receives Promise<T>

import type { Transferable } from "./shared_types.ts";

/** Basic primitive types that can be sent over MessagePort. */
export type Primitive = string | number | boolean | null | undefined;

/** Plain object type where values are postable. */
export type PlainObject = { [key: string]: Postable };

/** Types that can be posted via MessagePort including primitives, transferables, arrays and plain objects. */
export type Postable = Primitive | Transferable | Postable[] | PlainObject;

/** Helper type that removes trailing AbortSignal from parameter array. */
// deno-lint-ignore no-explicit-any
export type WithoutAbort<A extends any[]> = A extends
  [...infer Rest, AbortSignal | undefined] ? Rest : A;

/** Helper type that validates each parameter in the array is postable or a promise of postable. */
// deno-lint-ignore no-explicit-any
export type EachParamAllowed<T extends any[]> = T extends [infer F, ...infer R]
  ? F extends Postable | Promise<Postable> ? EachParamAllowed<R>
  : never
  : T;

/**
 * Handler function type that accepts arguments and an optional trailing AbortSignal.
 * All parameters must be postable types or promises of postable types.
 */
// deno-lint-ignore no-explicit-any
export type HandlerFn<Args extends any[] = any[], R = any> = (
  ...args: [
    ...EachParamAllowed<WithoutAbort<Args>> extends never ? never
      : WithoutAbort<Args>,
    AbortSignal?,
  ]
) => R;

/** Map of handler function names to handler functions. */
// deno-lint-ignore no-explicit-any
export type HandlerMap = Record<string, HandlerFn<any[], any>>;

/** Helper type for sender arguments allowing promises. */
export type SenderArgFromReceiverParam<P> = P | Promise<P>;

/** Helper type that maps receiver parameters to sender parameters (allowing promises). */
// deno-lint-ignore no-explicit-any
export type SenderArgsFromReceiverParams<Params extends any[]> = Params extends
  [...infer Rest] ? [
    ...{ [K in keyof Rest]: SenderArgFromReceiverParam<Rest[K]> },
    AbortSignal?,
  ]
  : never;

/** Normalizes handler return types to always be promises on the sender side. */
// deno-lint-ignore no-explicit-any
export type NormalizeReturn<R> = R extends Promise<any> ? R : Promise<R>;

/**
 * Sender API type derived from a HandlerMap.
 * Provides both a generic `call` method and typed methods for each handler.
 * All methods return promises and support passing promises as arguments.
 */
export type SenderApiFromHandlers<H extends HandlerMap> =
  & {
    call<K extends keyof H & string>(
      name: K,
      ...args: SenderArgsFromReceiverParams<WithoutAbort<Parameters<H[K]>>>
    ): NormalizeReturn<ReturnType<H[K]>>;
    close(): void;
  }
  & {
    [K in keyof H & string]: (
      ...args: SenderArgsFromReceiverParams<WithoutAbort<Parameters<H[K]>>>
    ) => NormalizeReturn<ReturnType<H[K]>>;
  };
