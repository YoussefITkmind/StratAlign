const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypeScript = require("eslint-config-next/typescript");

const frontendFiles = ["apps/frontend/**/*.{ts,tsx}"];

function scopeToFrontend(configurations) {
  return configurations.map((configuration) => ({
    ...configuration,
    files: frontendFiles,
  }));
}

module.exports = tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "apps/backend/src/generated/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  ...scopeToFrontend(nextCoreWebVitals),
  ...scopeToFrontend(nextTypeScript),

  {
    files: ["apps/backend/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  {
    files: frontendFiles,
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  {
    files: ["**/*.config.{js,ts,mjs,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);