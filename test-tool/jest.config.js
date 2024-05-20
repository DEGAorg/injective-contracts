
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/dist'],
  testMatch: ['**/tests/?(*.)+(spec|test).js?(x)'],
  globalSetup: './dist/tests/setup.js',
};