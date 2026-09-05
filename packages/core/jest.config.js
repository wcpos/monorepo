const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/src'],
	displayName: '@wcpos/core',
	preset: 'ts-jest',
	transform: {
		'^.+\\.js$': [
			'babel-jest',
			{
				babelrc: false,
				configFile: false,
				plugins: ['@babel/plugin-transform-modules-commonjs'],
			},
		],
		// Components whose rendered behavior depends on React Compiler memoization
		// (the app builds with experiments.reactCompiler) are compiled the same way
		// here; everything else goes through ts-jest. The patterns are mutually
		// exclusive so transformer pick order can't matter.
		//
		// data-table/index.tsx joined this list with the react-table v9 migration:
		// its useTableWrapper used to return `{ ...useReactTable(...) }`, and that
		// spread is illegal in v9 (methods live on prototypes now). The spread was
		// also breaking the table's object identity every render, which is what
		// kept React Compiler from serving a stale memo. v9's store subscription
		// is supposed to make that unnecessary — compiling this file the way the
		// app compiles it is what actually holds that claim to account.
		//
		// settings/customer-display/index.tsx joined with the cold-load pairing bug
		// (wcpos/roadmap#129): the compiler cached a module-level service read
		// behind a memo sentinel, so the screen never saw the service that started
		// after it mounted. Uncompiled, the same component passed every test.
		'(variable-product-row/(index|context|variations/(index|table|filters|footer))|components/data-table/index|settings/customer-display/index)\\.tsx$':
			'<rootDir>/jest/react-compiler-transform.js',
		'^(?!.*(variable-product-row/(index|context|variations/(index|table|filters|footer))|components/data-table/index|settings/customer-display/index)\\.tsx$).+\\.(ts|tsx)$':
			['ts-jest', { tsconfig: '<rootDir>/tsconfig.jest.json' }],
	},
	transformIgnorePatterns: [
		'node_modules/(?!@tanstack/(react-table|table-core|react-store|store)/)',
	],
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
		'^@wcpos/core-test/mock-use-doc-field$': '<rootDir>/jest/mock-use-doc-field.js',
		// Mock logger modules (must come before generic @wcpos/utils matcher)
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
		// jsdom jest has no platform-extension resolution, and the default
		// app-info variant imports expo-constants — map to the web variant.
		'^@wcpos/utils/app-info$': '<rootDir>/../utils/src/app-info/index.web',
		// Fallback for other @wcpos/utils imports
		'^@wcpos/utils/(.*)$': '<rootDir>/../utils/src/$1',
		'^@wcpos/database$': '<rootDir>/../database/src',
		'^@wcpos/database/(.*)$': '<rootDir>/../database/src/$1',
		'^@wcpos/hooks/(.*)$': '<rootDir>/../hooks/src/$1',
	},
};
