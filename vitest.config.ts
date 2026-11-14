import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Password hashing uses the production scrypt cost (128 MiB, ~0.3 s per hash), so account tests
  // need more than the 5 s default on a busy CI runner.
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 30_000 },
});
