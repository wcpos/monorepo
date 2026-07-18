const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/src'],
	displayName: '@wcpos/core',
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
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
		// Historical proxy mocks resolve to the deliberate public compatibility seam.
		'^@wcpos/query/engine-adapter/document-proxy$': '<rootDir>/../query/src/engine-compat.ts',
		// Mock logger modules (must come before generic @wcpos/utils matcher)
		'^@wcpos/utils/logger/error-codes$':
			'<rootDir>/jest/__mocks__/@wcpos/utils/logger/error-codes.js',
		'^@wcpos/utils/logger$': '<rootDir>/jest/__mocks__/@wcpos/utils/logger.js',
		// Other mocks
		'^expo-localization$': '<rootDir>/jest/__mocks__/expo-localization.js',
		'^expo-modules-core$': '<rootDir>/jest/__mocks__/expo-modules-core.js',
		'^react-native$': 'react-native-web',
		'^@wcpos/printer$': '<rootDir>/../printer/src/index.ts',
		'^@wcpos/scanner$': '<rootDir>/../scanner/src/index.ts',
		'^@wcpos/scanner/(.*)$': '<rootDir>/../scanner/src/$1',
		'^@wcpos/receipt-renderer$': '<rootDir>/../receipt-renderer/src/index.ts',
		'^@wcpos/receipt-renderer/(.*)$': '<rootDir>/../receipt-renderer/src/$1',
		'^@wcpos/printer/(.*)$': '<rootDir>/../printer/src/$1',
		'^@wcpos/components/(.*)$': '<rootDir>/../components/src/$1',
		// Fallback for other @wcpos/utils imports
		'^@wcpos/utils/(.*)$': '<rootDir>/../utils/src/$1',
		'^@wcpos/database$': '<rootDir>/../database/src',
		'^@wcpos/hooks/(.*)$': '<rootDir>/../hooks/src/$1',
	},
};
