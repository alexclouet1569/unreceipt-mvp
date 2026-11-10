// Runs with the website's vitest (../node_modules), for the app's plain
// TypeScript logic only. Screens are checked on a phone.
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
