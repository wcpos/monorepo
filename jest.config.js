// Root Jest config for monorepo - enables Cursor's Jest extension to run tests from any package
module.exports = {
	projects: [
		'<rootDir>/packages/core',
		'<rootDir>/packages/components',
		'<rootDir>/packages/database',
		'<rootDir>/packages/hooks',
		'<rootDir>/packages/utils',
		// Note: @wcpos/query has its own tsconfig with different paths
		// Run its tests separately: cd packages/query && npx jest
	],
};
