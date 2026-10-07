import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://localhost:8787";
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": api, "/logos": api, "/ws": { target: api, ws: true } } },
});
