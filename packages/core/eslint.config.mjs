import {
	config,
	designSystemOwnershipFiles,
	designSystemOwnershipSelectors,
} from '../eslint/index.js';

export default [
	// The shared ownership globs are repo-root-relative, but `pnpm lint` runs ESLint from
	// packages/core, where they match nothing. Rebase that block onto this package's tree.
	...config.map((entry) =>
		entry.files === designSystemOwnershipFiles ? { ...entry, files: ['src/**/*.tsx'] } : entry
	),

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
			// This block REPLACES the shared `no-restricted-syntax` for src/screens/** (flat config
			// does not merge a rule's options), so the design-system ownership selectors are
			// restated beside the #1093 one, or the ownership rule stops applying under src/screens.
			'no-restricted-syntax': [
				'error',
				...designSystemOwnershipSelectors,
				{
					selector: "Property[key.name='operation'] > Literal[value='delete']",
					message:
						"operation:'delete' is a SERVER delete (#1093). Deliberate destructive actions use requestServerDelete(); local cache eviction uses useCollectionReset()/scope.resetCollection().",
				},
			],
		},
	},
];
