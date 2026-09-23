import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/.wrangler/**", "**/worker-configuration.d.ts"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["apps/*/src/app/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Plain Node scripts (scripts/*.mjs) run outside Workers and browsers.
    files: ["scripts/**/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
    },
  },
);
