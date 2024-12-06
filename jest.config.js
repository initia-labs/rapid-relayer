// jest.config.js
module.exports = {
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/src/test/testSetup.ts'],
  testEnvironment: 'node',
  testMatch: ['**/?(*.)spec.ts'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  maxWorkers: 1,
}
