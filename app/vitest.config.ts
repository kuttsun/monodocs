import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // The suite runs many Chromium and highlighting tests in parallel, and under that load a
    // test that takes a second alone was measured past the 5 s default on main as well.
    testTimeout: 20_000,
  },
});
