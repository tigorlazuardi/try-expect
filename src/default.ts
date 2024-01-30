import { Context, createExecutor } from "./engine";

export class TryError extends Error {
    constructor(
        message: string,
        public readonly context: Context,
        public readonly code = 500,
        public readonly fields?: Record<string, unknown>,
    ) {
        super(message);
        this.name = "TryError";
    }

    public toJSON(): Record<string, unknown> {
        return {
            message: this.message,
        };
    }

    public fullJSONSerialize(indent?: string | number): string {
        return JSON.stringify(
            {
                message: this.message,
                context: this.context,
                code: this.code,
                fields: this.fields,
            },
            null,
            indent,
        );
    }
}

export const Try = createExecutor(
    (ctx: Context, code = 500, fields?: Record<string, unknown>) =>
        new TryError(ctx.message ?? "Internal Server Error", ctx, code, fields),
);

const data = Try(() => "foo").expect("cannot get data", "bar", "car", "baz");
