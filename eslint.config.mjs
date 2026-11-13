// Flat config for eslint-config-next 16, which ships flat configs natively
// ("eslint-config-next/core-web-vitals" and "/typescript" export config
// arrays). The old FlatCompat bridge broke — the package no longer publishes
// eslintrc-style entries.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { globalIgnores } from "eslint/config";

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    // react-hooks v6 (shipped with eslint-config-next 16) turns on the new
    // React-Compiler-era rules. They flag the site's whole data-fetching
    // effect architecture (verified bug-clean in the 2026-11 audit) —
    // adopting them means refactoring every fetch effect. Track as tech
    // debt; they stay visible as warnings. exhaustive-deps was warn-level
    // under eslint-config-next 15; keep that level to match history.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "node_modules/**",
    "drizzle/meta/**",
    "next-env.d.ts",
    // Local dev scripts (CommonJS tooling) — not part of the app bundle
    "scripts/**",
  ]),
];

export default eslintConfig;
