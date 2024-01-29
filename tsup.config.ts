import { defineConfig } from "tsup";

export default defineConfig({
    entryPoints: ["src/index.ts"],
    sourcemap: true,
    clean: true,
    dts: true,
    target: ["node12", "chrome58", "firefox57", "safari11", "edge16"],
    format: ["cjs", "esm", "iife"],
});
