import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  define: {
    "import.meta.env.VITE_STATIC_PREVIEW": JSON.stringify(mode === "preview"),
  },
  plugins: [react()],
  server: { proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          id.includes("node_modules/three") ? "three" : undefined,
      },
    },
  },
}));
