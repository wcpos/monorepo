// /** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
// module.exports = {
// 	preset: 'ts-jest',
// 	testEnvironment: 'node',
// };

const base = require('../../jest.config.base.js');

module.exports = {
	...base,
	roots: ['<rootDir>/src'],
	name: '@wcpos/database',
	displayName: '@wcpos/database',
};
