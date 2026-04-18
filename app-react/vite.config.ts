import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Unified-site build config:
//   - `npm run dev`   → standalone dev server on :5173 (for editing the landing)
//   - `npm run build` → static assets emitted to ../landing-build/ which is then
//     copied into project root by scripts/build-landing.sh so the Python
//     http.server on :8765 serves everything from one origin:
//       /             → React landing (index.html)
//       /app.html     → vanilla study app
//       /data/*.json  → shared
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/",
  build: {
    outDir: path.resolve(__dirname, "../landing-build"),
    emptyOutDir: true,
    assetsDir: "landing-assets",
  },
  server: {
    port: 5173,
    host: true,
  },
});
