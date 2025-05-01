import baseRules from "./packages/eslint/index.js";

export default [
  ...baseRules,
  {
    files: ["packages/rn-primitives/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "import/order": "off",
      "prettier/prettier": [
        "error",
        {
          useTabs: false, // Use 2 spaces instead of tabs
          singleQuote: true,
          trailingComma: "es5",
          printWidth: 100,
          endOfLine: "lf",
          plugins: ["prettier-plugin-tailwindcss"],
          tailwindFunctions: ["cn", "cva"],
        },
      ],
      "react/jsx-max-props-per-line": [
        "error",
        { maximum: 1, when: "multiline" },
      ],
    },
  },
];
