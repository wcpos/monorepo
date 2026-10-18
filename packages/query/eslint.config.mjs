import { config, designSystemOwnershipSelectors } from '../eslint/index.js';
export default [
	...config,
	{
		files: ['src/**/*.ts', 'src/**/*.tsx'],
		// The queued-delete read selects intents; it does not author one.
		ignores: ['src/mutations/request-server-delete.ts', 'src/reads/queued-delete.ts'],
		rules: {
			'no-restricted-syntax': [
				'error',
				...designSystemOwnershipSelectors,
				{
					selector: "Property[key.name='operation'] > Literal[value='delete']",
					message:
						"operation:'delete' is a SERVER delete (#1093). Use requestServerDelete(); local cache eviction uses scope.resetCollection().",
				},
			],
		},
	},
];
