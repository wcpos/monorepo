module.exports = {
	extends: [
		'eslint-config-universe',
		'plugin:react-hooks/recommended',
		'plugin:prettier/recommended',
	],
	plugins: ['@typescript-eslint', 'react-native', 'react-hooks', 'prettier'],
	rules: {
		'prettier/prettier': [
			'error',
			{
				useTabs: true,
				singleQuote: true,
				trailingComma: 'es5',
				printWidth: 100,
				endOfLine: 'lf',
			},
		],
		'import/order': [
			'error',
			{
				alphabetize: {
					order: 'asc' /* sort in ascending order. Options: ['ignore', 'asc', 'desc'] */,
					caseInsensitive: true /* ignore case. Options: [true, false] */,
				},
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
		'@typescript-eslint/no-useless-constructor': 'off',
	},
};
