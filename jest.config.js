const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/tests'],
	displayName: '@wcpos/query',
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				tsconfig: 'tsconfig.json',
				useESM: true,
			},
		],
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['js', 'ts', 'tsx', 'json', 'node'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(tsx?|ts?)$'],
	verbose: true,
	transformIgnorePatterns: ['node_modules/(?!(@shelf/fast-natural-order-by)/)'],
	testEnvironment: 'jsdom',
};
