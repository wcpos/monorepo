const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/tests'],
	displayName: '@wcpos/query',
	preset: 'ts-jest',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.cjs'],
	maxWorkers: 1, // Run tests serially to avoid database name conflicts
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
				// Disable type checking - just transpile
				// This avoids path resolution issues when running from monorepo root
				// Type checking is handled by tsc and the IDE
				isolatedModules: true,
			},
		],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'json', 'node', 'js', 'jsx'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(tsx?|ts?)$'],
	verbose: true,
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^@wcpos/utils/src/logger$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/utils/logger$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/utils/logger/error-codes$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/hooks/use-http-client/parse-wp-error$': '<rootDir>/tests/__mocks__/http.ts',
		'^@wcpos/database$': '<rootDir>/tests/helpers/db.ts',
	},
};
