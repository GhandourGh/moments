import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

// UI-only — no backend proxy. Photos are kept in component state for now.
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    port: 5174,
    host: true, // listen on LAN so phones can reach the dev server
    https: true, // camera needs a secure context on mobile (not http://IP)
  },
  preview: {
    port: 5174,
    host: true,
    https: true,
  },
});
