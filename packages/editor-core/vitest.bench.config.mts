import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.bench.ts"],
    testTimeout: 180_000,
    hookTimeout: 60_000,
    reporters: ["default"]
  }
});
