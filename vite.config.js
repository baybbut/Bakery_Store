import { defineConfig } from "vite";
export default defineConfig({
  // Keep the browser's Host header so the API's same-origin check also passes on LAN addresses.
  server: {
    host: "0.0.0.0",
    proxy: { "/api": { target: "http://127.0.0.1:3001", changeOrigin: false } },
  },
  build: { rollupOptions: { input: ["index.html", "admin.html"] } },
});
