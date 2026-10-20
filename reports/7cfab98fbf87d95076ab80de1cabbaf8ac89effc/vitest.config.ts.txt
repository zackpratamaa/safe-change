import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ["tests/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/types/**/*.ts",
        "src/dashboard/template.ts",
        "src/cli.ts",
        "src/index.ts",
        "src/mcp/index.ts",
        "src/commands/dashboard.ts",
      ],
      thresholds: {
        statements: 75,
        lines: 75,
        functions: 85,
        branches: 62,
      },
    },
  },
});
