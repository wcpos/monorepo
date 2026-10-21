import {
	config,
	designSystemOwnershipFiles,
	gateScreenFiles,
} from '../../packages/eslint/index.js';

// The shared ownership globs are repo-root-relative, but `pnpm lint` runs ESLint from
// apps/main, where they match nothing. Rebase those blocks onto this app's tree.
export default config.map((entry) =>
	entry.files === designSystemOwnershipFiles
		? { ...entry, files: ['**/*.tsx'] }
		: entry.files === gateScreenFiles
			? { ...entry, files: ['app/**/*.tsx'] }
			: entry
);
