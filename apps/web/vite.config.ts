import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // same-origin /api keeps the strict, path-scoped refresh cookie working
  server: { proxy: { "/api": "http://localhost:3000" } },
});
