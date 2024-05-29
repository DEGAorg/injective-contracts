
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/dist'],
  testMatch: ['**/tests/?(*.)+(spec|test).js?(x)'],
  globalSetup: './dist/tests/setup.js',
  maxWorkers: 1,
  collectCoverage: true,
  coverageDirectory: './coverage',
  collectCoverageFrom: [
    '**/helpers/**/*.js'
  ],
};