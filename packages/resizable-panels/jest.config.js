process.env.NODE_ENV = 'development';

const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	displayName: '@wcpos/resizable-panels',
	preset: 'ts-jest',
	testEnvironment: 'node',
	transform: {
		'^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }],
	},
	testRegex: TEST_REGEX,
	moduleNameMapper: { '^react-native$': 'react-native-web' },
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.test.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/**/index.{ts,tsx}',
	],
	verbose: true,
};
