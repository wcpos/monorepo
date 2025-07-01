import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  eslintPluginPrettierRecommended,
  ...expoConfig,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    settings: {
      'import/resolver': {
        typescript: {
          project: ['../../tsconfig.json', './packages/*/tsconfig.json'],
        },
      },
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          useTabs: true,
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 100,
          endOfLine: 'lf',
          plugins: ['prettier-plugin-tailwindcss'],
          tailwindFunctions: ['cn', 'cva'],
        },
      ],

      // 1) import/order for grouping/newlines only — no alphabetize
      'import/order': [
        'error',
        {
          pathGroups: [
            {
              pattern: 'react+(-native|)',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@wcpos/**',
              group: 'external',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['react', 'react-native'],
          groups: ['builtin', 'external', ['parent', 'sibling', 'index'], 'type'],
          'newlines-between': 'always',
        },
      ],

      // 2) sort-imports for in-brace specifier sorting
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true, // leave statement order to import/order
          ignoreMemberSort: false,     // sort the { a, b, c } lists
          ignoreCase: true,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],

      '@typescript-eslint/no-useless-constructor': 'off',
    },
  },
];