// Phase 1 type helpers: non-stream RPC only.
// Sender->Receiver: sender may pass T | Promise<T>; receiver receives T
// Receiver->Sender: receiver may return T | Promise<T>; sender receives Promise<T>

export type Primitive = string | number | boolean | null | undefined;

export type PlainObject = { [key: string]: Postable };
export type Postable = Primitive | Transferable | Postable[] | PlainObject;

// deno-lint-ignore no-explicit-any
type WithoutAbort<A extends any[]> = A extends
  [...infer Rest, AbortSignal | undefined] ? Rest : A;
// deno-lint-ignore no-explicit-any
type EachParamAllowed<T extends any[]> = T extends [infer F, ...infer R]
  ? F extends Postable | Promise<Postable> ? EachParamAllowed<R>
  : never
  : T;

// deno-lint-ignore no-explicit-any
export type HandlerFn<Args extends any[] = any[], R = any> = (
  ...args: [
    ...EachParamAllowed<WithoutAbort<Args>> extends never ? never
      : WithoutAbort<Args>,
    AbortSignal?,
  ]
) => R;

// deno-lint-ignore no-explicit-any
export type HandlerMap = Record<string, HandlerFn<any[], any>>;

// Sender arg mapping: if receiver expects U -> sender may provide U | Promise<U>
type SenderArgFromReceiverParam<P> = P | Promise<P>;
// deno-lint-ignore no-explicit-any
type SenderArgsFromReceiverParams<Params extends any[]> = Params extends
  [...infer Rest] ? [
    ...{ [K in keyof Rest]: SenderArgFromReceiverParam<Rest[K]> },
    AbortSignal?,
  ]
  : never;

// Normalize return to Promise on sender
// deno-lint-ignore no-explicit-any
export type NormalizeReturn<R> = R extends Promise<any> ? R : Promise<R>;

// Final Sender API type derived from HandlerMap H
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
