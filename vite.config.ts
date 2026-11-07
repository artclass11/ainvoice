import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const basePath = env.VITE_BASE_PATH || "/";

  return {
    base: basePath,
    server: {
      watch: {
        ignored: ["**/src-tauri/**"]
      }
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: [],
        manifest: {
          name: "AInvoice",
          short_name: "AInvoice",
          description: "Simple offline-first billing for every business.",
          theme_color: "#090909",
          background_color: "#090909",
          display: "standalone",
          start_url: basePath,
          scope: basePath,
          icons: [{ src: basePath + "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }]
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,svg,png,woff2}"]
        }
      })
    ]
  };
});
