import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so dist/ works from any folder or static host.
  base: "./",
  plugins: [react()],
  test: { environment: "node" },
});
