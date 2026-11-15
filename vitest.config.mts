import { defineConfig } from "vitest/config";
import path from "node:path";

// Pure-function tests only: engine/, any pure helpers under convex/, and pure app helpers under src/lib. No DOM, no React Native.
export default defineConfig({
  resolve: {
    alias: { "@engine": path.resolve(import.meta.dirname, "engine") },
  },
  test: {
    environment: "node",
    include: ["engine/**/*.test.ts", "convex/**/*.test.ts", "src/lib/**/*.test.ts"],
  },
});
