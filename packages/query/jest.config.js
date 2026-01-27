const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|ts?)$';

export default {
	roots: ['<rootDir>/tests'],
	displayName: '@wcpos/query',
	preset: 'ts-jest',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
	maxWorkers: 1, // Run tests serially to avoid database name conflicts
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
			},
		],
		'^.+\\.js$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
			},
		],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'json', 'node', 'js', 'jsx'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(tsx?|ts?)$'],
	verbose: true,
	transformIgnorePatterns: ['node_modules/(?!(uuid)/)'],
	testEnvironment: 'jsdom',
	moduleNameMapper: {
		'^@wcpos/utils/src/logger$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/utils/logger$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/utils/logger/error-codes$': '<rootDir>/tests/__mocks__/logger.ts',
		'^@wcpos/hooks/use-http-client/parse-wp-error$': '<rootDir>/tests/__mocks__/http.ts',
		'^@wcpos/database$': '<rootDir>/tests/helpers/db.ts',
	},
};
