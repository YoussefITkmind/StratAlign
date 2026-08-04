import { defineConfig } from "vitest/config";
import swc from "unplugin-swc";

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: "node",
    include: ["test/**/*.spec.ts"],
    clearMocks: true,
    restoreMocks: true,
    hookTimeout: 60000,
    testTimeout: 60000,
  },
});