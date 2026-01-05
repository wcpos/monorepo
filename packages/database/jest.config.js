const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/src'],
	displayName: '@wcpos/database',
	preset: 'ts-jest',
	testEnvironment: 'node',
	transform: {
		'^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(jsx?|tsx?)$'],
	verbose: true,
	moduleNameMapper: {
		'^@wcpos/utils/(.*)$': '<rootDir>/../utils/src/$1',
	},
	globals: {
		__DEV__: true,
	},
};
