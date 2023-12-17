// /** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
// module.exports = {
// 	preset: 'ts-jest',
// 	testEnvironment: 'node',
// };
const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(jsx?|js?|tsx?|ts?)$';

module.exports = {
	roots: ['<rootDir>/tests'],
	displayName: '@wcpos/query',
	// preset: 'ts-jest',
	// transform: {
	// 	'^.+\\.(ts|tsx)$': 'ts-jest',
	// },
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
	transformIgnorePatterns: ['node_modules/(?!(@shelf/fast-natural-order-by)/)'],
	testEnvironment: 'jsdom',
};
