module.exports = {
  testEnvironment:   'node',
  testMatch:         ['**/tests/**/*.test.js'],
  collectCoverage:   false,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'controllers/**/*.js',
    'services/**/*.js',
    'models/**/*.js',
    'middleware/**/*.js',
    '!**/node_modules/**'
  ],
  testTimeout: 30000,
  verbose:     true,
  globalSetup:     './tests/globalSetup.js',
}