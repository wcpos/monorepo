const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	displayName: '@wcpos/components',
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				diagnostics: false,
				isolatedModules: true,
			},
		],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverage: true,
	coverageDirectory: '<rootDir>/coverage',
	coveragePathIgnorePatterns: ['(tests/.*.mock).(jsx?|tsx?)$'],
	verbose: true,
};
