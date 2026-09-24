import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// The survey UI in a browser-like DOM (jsdom), separate from the Worker tests, which run in workerd.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["test-ui/**/*.test.tsx"],
  },
});
