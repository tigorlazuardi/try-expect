export type Context<T = unknown> = {
    source: T;
    caller: {
        file: string;
        line: number;
    };
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
    ErrorBuilder extends (ctx: Context, message: string, ...args: Args) => Err,
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
    ErrorBuilder extends (ctx: Context, message: string, ...args: Args) => Err,
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
    ErrorBuilder extends (ctx: Context, message: string, ...args: Args) => Err,
> {
    protected classHandlers: [Class, () => Err][] = [];
    protected stringHandler?: () => Err;
    protected numberHandlers?: () => Err;
    protected booleanHandlers?: () => Err;
    protected objectHandler?: () => Err;
    protected bigintHandler?: () => Err;

    constructor(
        protected builder: ErrorBuilder,
        private data?: Return,
        private err?: unknown,
    ) {}

    expect<U extends Exclude<Return, undefined>>(
        v: undefined,
        message: string,
        ...args: Args
    ): Result<U, Args, Err, ErrorBuilder>;
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
            if (args.length === 2) {
                const fn = (): Err => args[1](ctx);
                this.classHandlers.push([args[0], fn]);
                return this;
            }
            const msg = args[1] as string;
            const argz = args.slice(2) as Args;
            const fn = (): Err => this.builder(ctx, msg, ...argz);
            this.classHandlers.push([args[0], fn]);
            return this;
        }

        return this.data!;
    }
}

export class ResultAsync<
    Return,
    Args extends any[],
    Err extends Error,
    ErrorBuilder extends (ctx: Context, message: string, ...args: Args) => Err,
> extends Result<Return, Args, Err, ErrorBuilder> {
    constructor(
        builder: ErrorBuilder,
        private promise: Promise<Return>,
    ) {
        super(builder);
    }
}
