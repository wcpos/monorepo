process.env.NODE_ENV = 'development';

const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	displayName: 'react-native-resizable-panels',
	preset: 'ts-jest',
	testEnvironment: 'node',
	transform: {
		// The separator a11y hooks are compiled with babel-plugin-react-compiler,
		// as the app compiles them (apps/main app.config.ts sets
		// experiments.reactCompiler): ts-jest skips the compiler, and the bug this
		// guards — the compiler memoising `model.getSeparatorAriaValues()` on
		// [model, handleId] so a native handle reported a bare "Resize handle"
		// for the whole session (iPad, 2026-08-30) — is invisible without it.
		// The patterns are mutually exclusive so transformer pick order can't matter.
		'hooks/useSeparatorA11y(\\.web)?\\.ts$': '<rootDir>/jest/react-compiler-transform.js',
		'^(?!.*hooks/useSeparatorA11y(\\.web)?\\.ts$).+\\.(ts|tsx)$': [
			'ts-jest',
			{ tsconfig: 'tsconfig.json', isolatedModules: true },
		],
	},
	testRegex: TEST_REGEX,
	moduleNameMapper: { '^react-native$': 'react-native-web' },
	moduleFileExtensions: ['web.ts', 'web.tsx', 'ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.test.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/**/index.{ts,tsx}',
	],
	verbose: true,
};
