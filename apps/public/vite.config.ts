import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Both Workers persist local state to the same folder, so they share one local D1.
    cloudflare({ persistState: { path: "../../.wrangler/state" } }),
  ],
  server: { port: 5173 },
});
