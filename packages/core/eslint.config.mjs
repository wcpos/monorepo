import { config } from '../eslint/index.js';

export default [
	...config,

	// #1093 guardrail: `engine.write({ operation: 'delete' })` is a durable
	// SERVER delete. UI code must go through requestServerDelete() — a named,
	// single-purpose choke point — so a destructive intent can never hide inside
	// a refresh/clear affordance again. Local cache eviction rides
	// useCollectionReset() / scope.resetCollection().
	{
		files: ['src/screens/**/*.ts', 'src/screens/**/*.tsx'],
		// Tests may spell the literal: pinning delete intents in tests is the point.
		ignores: [
			'src/screens/main/hooks/mutations/request-server-delete.ts',
			'src/screens/**/*.test.ts',
			'src/screens/**/*.test.tsx',
		],
		rules: {
			'no-restricted-syntax': [
				'error',
				{
					selector: "Property[key.name='operation'] > Literal[value='delete']",
					message:
						"operation:'delete' is a SERVER delete (#1093). Deliberate destructive actions use requestServerDelete(); local cache eviction uses useCollectionReset()/scope.resetCollection().",
				},
			],
		},
	},
];
