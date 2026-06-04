import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // The PRD mandates that the test suite never calls a real LLM.
    // MOCK_LLM is forced on for every test run regardless of the ambient env.
    env: {
      MOCK_LLM: "true",
    },
  },
});
