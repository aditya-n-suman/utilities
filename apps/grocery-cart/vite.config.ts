import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI lives in src/ui and is served by src/local/server.ts from dist/ui.
// `npm run dev:ui` runs Vite with /api proxied to a server started with `./instruction.sh start`.
export default defineConfig({
  root: "src/ui",
  base: "./",
  plugins: [react()],
  build: { outDir: "../../dist/ui", emptyOutDir: true },
  server: { proxy: { "/api": "http://127.0.0.1:4180" } },
});
