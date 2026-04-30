import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import reactCompiler from 'eslint-plugin-react-compiler';

export const config = [
	// Global ignores - git submodules manage their own linting
	{ ignores: ['apps/electron/**', 'apps/web/**'] },
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
					ignoreMemberSort: false, // sort the { a, b, c } lists
					ignoreCase: true,
					memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
				},
			],
			'import/no-unresolved': [
				'error',
				{
					ignore: ['^uniwind$', '^uniwind/.+', '^rxdb-premium/.+', '^rxdb-premium-old/.+'],
				},
			],

			// Catch deprecated reanimated imports that moved to react-native-worklets in v4
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'react-native-reanimated',
							importNames: [
								'runOnJS',
								'runOnUI',
								'executeOnUIRuntimeSync',
								'runOnRuntime',
								'makeShareableCloneRecursive',
								'createWorkletRuntime',
								'WorkletRuntime',
								'isWorkletFunction',
							],
							message:
								'This export is deprecated in reanimated v4. Import from "react-native-worklets" instead (e.g. runOnJS → scheduleOnRN, runOnUI → scheduleOnUI).',
						},
					],
				},
			],

			'@typescript-eslint/no-useless-constructor': 'off',

			// prefer function declarations for named components, and arrow functions for unnamed components
			'react/function-component-definition': [
				'error',
				{
					namedComponents: 'function-declaration',
					unnamedComponents: 'arrow-function',
				},
			],

			// prefer named exports over default exports
			'import/no-default-export': 'error',
		},
	},

	// E2E tests run against localized stores; selectors must be stable testIDs, not UI copy.
	{
		files: ['**/e2e/**/*.{ts,tsx,js,jsx}'],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "CallExpression[callee.property.name='getByText']",
					message: 'E2E tests must use getByTestId(), not localized visible text.',
				},
				{
					selector: "CallExpression[callee.property.name='getByPlaceholder']",
					message: 'E2E tests must use getByTestId(), not localized placeholders.',
				},
				{
					selector: "CallExpression[callee.property.name='getByLabel']",
					message: 'E2E tests must use getByTestId(), not localized labels.',
				},
				{
					selector:
						"CallExpression[callee.property.name='getByRole'] ObjectExpression Property[key.name='name']",
					message: 'E2E tests must use getByTestId(), not localized role names.',
				},

				{
					selector: "CallExpression[callee.property.name='locator'] Literal[value=/^text=/]",
					message: 'E2E tests must use getByTestId(), not text locators.',
				},
			],
		},
	},
	reactCompiler.configs.recommended,
	// Files that legitimately need default exports
	{
		files: [
			'app/**/*.{ts,tsx}', // Expo Router requires default exports
			'**/app/**/*.{ts,tsx}', // Same Expo Router convention when linting from repo root
			'app.config.ts', // Expo config
			'**/*.config.{ts,js}', // Config files (playwright, etc.)
			'**/*.stories.{ts,tsx}', // Storybook
			'**/e2e/global-setup.ts', // Playwright global setup
			'**/tree-dom.tsx', // Expo "use dom" requires default export
			'**/discord.tsx', // Expo "use dom" requires default export
			'**/reports/chart/chart.tsx', // Dynamic import via WithSkiaWeb requires default export
		],
		rules: {
			'import/no-default-export': 'off',
		},
	},
];
