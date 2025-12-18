// Root Jest config for monorepo - enables Cursor's Jest extension to run tests from any package
module.exports = {
	projects: [
		'<rootDir>/packages/core',
		'<rootDir>/packages/components',
		// '<rootDir>/packages/database', // TODO: fix missing jest.config.base.js
		// '<rootDir>/packages/query', // Uses ESM export syntax
	],
};
