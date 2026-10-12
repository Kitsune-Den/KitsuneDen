import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs. Wrapping them in
// FlatCompat (the old next 15 recipe) crashes with "Converting circular
// structure to JSON" because the plugin objects are self-referential.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Adapters implement a shared interface, so some methods take params
    // they don't need. A leading underscore marks those as intentional.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // .claude/ holds Claude Code session worktrees: full checkouts with their
  // own .next output, which would otherwise be linted as part of this repo.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", ".claude/**"]),
]);

export default eslintConfig;
