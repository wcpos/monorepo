const TEST_REGEX = '(/__tests__/.*|(\\.|/)(test|spec))\\.(tsx?|ts?)$';

module.exports = {
  roots: ['<rootDir>/tests'],
  displayName: '@wcpos/query',
  preset: 'ts-jest',
  // setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
      // useESM: true,
      isolatedModules: true,
    }],
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  testRegex: TEST_REGEX,
  moduleFileExtensions: ['ts', 'tsx', 'json', 'node', 'js', 'jsx'],
  collectCoverage: true,
  coveragePathIgnorePatterns: ['(tests/.*.mock).(tsx?|ts?)$'],
  verbose: true,
  transformIgnorePatterns: ['node_modules/(?!(lodash-es)/)'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@wcpos/utils/src/logger$': '<rootDir>/tests/__mocks__/logger.ts',
  },
};
