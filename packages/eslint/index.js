import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";
import reactNative from "eslint-plugin-react-native";
import prettier from "eslint-plugin-prettier";
import importPlugin from "eslint-plugin-import";
import eslintConfigUniverse from "eslint-config-universe";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        jsxPragma: null,
        projectService: true,
        warnOnUnsupportedTypeScriptVersion: false,
      },
    },
    plugins: {
      "react-native": reactNative,
      prettier,
      "react-hooks": reactHooks,
      "@typescript-eslint": tsParser,
      import: importPlugin,
      "eslint-config-universe": eslintConfigUniverse,
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          useTabs: true,
          singleQuote: true,
          trailingComma: "es5",
          printWidth: 100,
          endOfLine: "lf",
        },
      ],
      "import/order": [
        "error",
        {
          alphabetize: {
            order: "asc", // sort in ascending order
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: "react+(-native|)",
              group: "external",
              position: "before",
            },
            {
              pattern: "@wcpos/**",
              group: "external",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["react", "react-native"],
          groups: [
            "builtin",
            "external",
            ["parent", "sibling", "index"],
            "type",
          ],
          "newlines-between": "always",
        },
      ],
      "@typescript-eslint/no-useless-constructor": "off",
    },
  },
];
