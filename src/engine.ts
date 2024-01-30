export type Context<T = unknown> = {
    source: T;
    caller: {
        file: string;
        line: number;
    };
    /**
     * message is populated when the "expect" method with string message is used.
     *
     * message is undefined when the "expect" method with handler callback function is used.
     */
    message?: string;
};

function isPromise<T>(value: unknown): value is Promise<T> {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as Promise<T>).then === "function" &&
        typeof (value as Promise<T>).catch === "function"
    );
}

export interface Executor<
    Args extends any[],
    Err extends Error,
    ErrorBuilder extends (ctx: Context, ...args: Args) => Err,
> {
    <T>(
        fn: () => T,
    ): T extends Promise<any>
        ? ResultAsync<Awaited<T>, Args, Err, ErrorBuilder>
        : Result<T, Args, Err, ErrorBuilder>;
    <T>(promise: Promise<T>): ResultAsync<T, Args, Err, ErrorBuilder>;
}

export function createExecutor<
    Args extends any[],
    Err extends Error,
    ErrorBuilder extends (ctx: Context, ...args: [...Args]) => Err,
>(builder: ErrorBuilder): Executor<Args, Err, ErrorBuilder> {
    return (<T>(
        fn: (() => T | Promise<T>) | Promise<T>,
    ):
        | Result<T, Args, Err, ErrorBuilder>
        | ResultAsync<T, Args, Err, ErrorBuilder> => {
        try {
            if (isPromise(fn)) {
                return new ResultAsync(builder, fn);
            }
            const data = fn();
            if (isPromise(data)) {
                return new ResultAsync(builder, data);
            }
            return new Result(builder, data);
        } catch (e) {
            return new Result<T, Args, Err, ErrorBuilder>(
                builder,
                undefined,
                e,
            );
        }
    }) as Executor<Args, Err, ErrorBuilder>;
}

interface Class {
    new (...args: any[]): any;
    [Symbol.hasInstance]: Function;
}

function isClass(value: unknown): value is Class {
    return (
        typeof value === "function" &&
        typeof value.prototype === "object" &&
        value.prototype.constructor === value
    );
}

export class Result<
    Return,
    Args extends any[],
    Err extends Error,
    ErrorBuilder extends (ctx: Context, ...args: Args) => Err,
> {
    protected classHandlers: [Class, () => Err][] = [];
    protected undefinedHandler?: () => Err;
    protected nullHandler?: () => Err;

    constructor(
        protected builder: ErrorBuilder,
        private data?: Return,
        private err?: unknown,
    ) {}

    /**
     * or returns the given value if the Result is an Error.
     *
     * Use callback function to create the value lazily.
     *
     * Example:
     *
     * ```typescript
     * const Try = createExecutor((ctx) => new MyError(ctx.message ?? "Internal Server Error", ctx.source))
     *
     * function shouldError(): string {
     *   throw new Error("Error");
     * }
     *
     * function noError(): string {
     *   return "no error";
     * }
     *
     * function expensiveFallback(): string {
     *   console.log("expensiveFallback called")
     *   return "fallback";
     * }
     *
     * const data = Try(() => shouldError()).or("other value") // data is "other value". Eagerly evaluated. Good for static values.
     * const data = Try(() => shouldError()).or(() => expensiveFallback()) // data is "fallback". expensiveFallback is called because the Result is an Error.
     * const data = Try(() => noError()).or(() => expensiveFallback()) // data is "no error". expensiveFallback is never called because the Result is not an Error.
     * ```
     */
    or(value: Return | ((ctx: Context) => Return)): Return {
        if (this.err) {
            if (typeof value === "function") {
                const v = value as (ctx: Context) => Return;
                const file =
                    new Error().stack?.split("\n")[2].split(" (")[0] ?? "";
                const line = Number(file.split(":")[1]) || 0;
                const ctx: Context = {
                    caller: {
                        line,
                        file,
                    },
                    source: this.err,
                };
                return v(ctx);
            }
            return value;
        }
        return this.data!;
    }

    /**
     * expect (undefined) asserts that the Data (not the Error) is not undefined.
     *
     * If the  Data is undefined, an Error is thrown.
     *
     * ```typescript
     * const Try = createExecutor((ctx) => new MyError(ctx.message, ctx.source))
     *
     * function maybeUndefined(): string | undefined {
     *  return undefined;
     * }
     *
     * const data = Try(() => maybeUndefined())
     *   .expect(undefined, "Data is undefined") // This will throw an error with the message "Data is undefined" with the type MyError
     *   .expect("Unexpected Error");
     * ```
     */
    expect<U extends Exclude<Return, undefined>>(
        v: undefined,
        message: string,
        ...args: Args
    ): Result<U, Args, Err, ErrorBuilder>;
    /**
     * expect (undefined) asserts that the Data (not the Error) is not undefined.
     *
     * If the  Data is undefined, an Error is thrown.
     */
    expect<U extends Exclude<Return, undefined>>(
        v: undefined,
        handler: (ctx: Context<undefined>) => Err,
    ): Result<U, Args, Err, ErrorBuilder>;
    expect<U extends Exclude<Return, null>>(
        v: null,
        message: string,
        ...args: Args
    ): Result<U, Args, Err, ErrorBuilder>;
    expect<U extends Exclude<Return, null>>(
        v: null,
        handler: (ctx: Context<null>) => Err,
    ): Result<U, Args, Err, ErrorBuilder>;
    expect<C extends Class, U extends Exclude<Return, C>>(
        v: C,
        message: string,
        ...args: Args
    ): Result<U, Args, Err, ErrorBuilder>;
    expect<C extends Class, U extends Exclude<Return, C>>(
        v: C,
        handler: (ctx: Context<C>) => Err,
    ): Result<U, Args, Err, ErrorBuilder>;
    /**
     * expect (handle all) handles everything uncovered by the other expect methods
     * and acts as a finisher for the expect chain.
     *
     */
    expect(message: string, ...args: Args): Return;
    expect(...args: any[]): Result<Return, Args, Err, ErrorBuilder> | Return {
        const file = new Error().stack?.split("\n")[2].split(" (")[0] ?? "";
        const line = Number(file.split(":")[1]) || 0;
        const ctx: Context = {
            caller: {
                line,
                file,
            },
            source: this.err,
        };

        if (isClass(args[0])) {
            if (args.length === 2 && typeof args[1] === "function") {
                const fn = (): Err => args[1](ctx);
                this.classHandlers.push([args[0], fn]);
                return this;
            }
            ctx.message = args[1] as string;
            const argz = args.slice(2) as Args;
            const fn = (): Err => this.builder(ctx, ...argz);
            this.classHandlers.push([args[0], fn]);
            return this;
        }

        if (typeof args[0] === "undefined") {
            if (args.length === 2 && typeof args[1] === "function") {
                this.undefinedHandler = () => args[1](ctx);
                return this;
            }
            ctx.message = args[1] as string;
            const argz = args.slice(2) as Args;
            this.undefinedHandler = () => this.builder(ctx, ...argz);
            return this;
        }

        if (typeof args[0] === null) {
            if (args.length === 2 && typeof args[1] === "function") {
                this.nullHandler = () => args[1](ctx);
                return this;
            }
            ctx.message = args[1] as string;
            const argz = args.slice(2) as Args;
            this.nullHandler = () => this.builder(ctx, ...argz);
            return this;
        }

        return this.data!;
    }
}

export class ResultAsync<
    Return,
    Args extends any[],
    Err extends Error,
    ErrorBuilder extends (ctx: Context, ...args: Args) => Err,
> extends Result<Return, Args, Err, ErrorBuilder> {
    constructor(
        builder: ErrorBuilder,
        private promise: Promise<Return>,
    ) {
        super(builder);
    }
}
