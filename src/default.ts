import { Context, createExecutor } from "./engine";

export class TryError extends Error {
    constructor(
        message: string,
        public readonly context: Context,
        public readonly httpStatusCode = 500,
        public readonly fields?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "TryError";
    }
}

export const Try = createExecutor(
    (ctx: Context, httpStatusCode?: number, fields?: Record<string, unknown>) =>
        new TryError(
            ctx.message ?? "Internal Server Error",
            ctx,
            httpStatusCode,
            fields,
        ),
);

function possibleUndefined() {
    const rand = Math.random();
    if (rand > 0.5) {
        return "foo";
    }
}

const data = Try(() => possibleUndefined())
    .expect(undefined, (ctx) => new Error("data is undefined"))
    .expect("cannot get data", 500, {
        foo: "bar",
    });
