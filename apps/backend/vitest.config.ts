import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});