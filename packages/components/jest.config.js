const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	displayName: '@wcpos/components',
	preset: 'ts-jest',
	testEnvironment: 'jsdom',
	transform: {
		// The rn-primitives builds ship JSX; a suite that needs the browser behaviour (the
		// popover's outside press, monorepo#2313) loads the web build, as @wcpos/core does.
		'/node_modules/@rn-primitives/.+\\.js$': [
			'babel-jest',
			{
				babelrc: false,
				configFile: false,
				plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
			},
		],
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
	transformIgnorePatterns: ['node_modules/(?!@rn-primitives/)'],
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
