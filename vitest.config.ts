import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["node_modules/**", "dist/**", ".repos/**"],
    include: ["test/**/*.test.ts"],
  },
});
