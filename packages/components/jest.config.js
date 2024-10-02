const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	preset: 'ts-jest',
	// roots: ['<rootDir>/src'],
	transform: {
		'^.+\\.ts$': 'ts-jest',
		'^.+\\.tsx$': 'ts-jest',
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(jsx?|tsx?)$'],
	verbose: true,
	globals: {
		'ts-jest': {
			diagnostics: false,
			// isolatedModules: true,
		},
	},
};
