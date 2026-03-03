/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', { // Target both .ts and .js files (and their react variants)
      useESM: true,
      isolatedModules: true,
    }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^mysql2/promise$': '<rootDir>/src/__mocks__/mysql2/promise.js',
    '^pg$': '<rootDir>/src/__mocks__/pg/index.js',
  },
};
