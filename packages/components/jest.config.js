const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	displayName: '@wcpos/components',
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	transform: {
		'^.+\\.(ts|tsx)$': [
			'ts-jest',
			{
				diagnostics: false,
				isolatedModules: true,
				tsconfig: {
					jsx: 'react-jsx',
				},
			},
		],
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
	setupFilesAfterEnv: ['<rootDir>/jest/setup.ts'],
	moduleNameMapper: {
		'^react-native$': 'react-native-web',
		// react-native-svg's web elements import `@react-native/assets-registry/registry`, a package
		// React Native 0.88 no longer depends on and whose 0.88 build is ESM, which this CommonJS
		// runner cannot load. These suites already run react-native as react-native-web, so use its
		// CommonJS build of the same registry. Drop when react-native-svg imports the registry from
		// `react-native/asset-registry`.
		'^@react-native/assets-registry/registry$': 'react-native-web/dist/cjs/modules/AssetRegistry',
	},
	globals: {
		__DEV__: true,
	},
};
