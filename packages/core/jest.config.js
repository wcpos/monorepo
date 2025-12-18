// /** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
// module.exports = {
// 	preset: 'ts-jest',
// 	testEnvironment: 'node',
// };
const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/src'],
	displayName: '@wcpos/core',
	preset: 'ts-jest',
	transform: {
		'^.+\\.(ts|tsx)$': 'ts-jest',
	},
	testRegex: TEST_REGEX,
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
	collectCoverage: true,
	coveragePathIgnorePatterns: ['(tests/.*.mock).(jsx?|tsx?)$'],
	verbose: true,
	globals: {
		'ts-jest': {
			tsconfig: 'tsconfig.json',
		},
	},
	moduleNameMapper: {
		'^expo-localization$': '<rootDir>/jest/__mocks__/expo-localization.js',
	},
};
