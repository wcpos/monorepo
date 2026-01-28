const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/src'],
	displayName: '@wcpos/core',
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverage: true,
	coverageDirectory: '<rootDir>/coverage',
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.test.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/**/index.{ts,tsx}',
	],
	coveragePathIgnorePatterns: ['(tests/.*.mock).(jsx?|tsx?)$'],
	verbose: true,
	setupFilesAfterEnv: ['<rootDir>/jest/setup.js'],
	moduleNameMapper: {
		// Mock logger modules (must come before generic @wcpos/utils matcher)
		'^@wcpos/utils/logger/error-codes$': '<rootDir>/jest/__mocks__/@wcpos/utils/logger/error-codes.js',
		'^@wcpos/utils/logger$': '<rootDir>/jest/__mocks__/@wcpos/utils/logger.js',
		// Other mocks
		'^expo-localization$': '<rootDir>/jest/__mocks__/expo-localization.js',
		// Fallback for other @wcpos/utils imports
		'^@wcpos/utils/(.*)$': '<rootDir>/../utils/src/$1',
		'^@wcpos/database$': '<rootDir>/../database/src',
	},
};
