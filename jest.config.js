// jest.config.js
export const preset = 'ts-jest'
export const setupFilesAfterEnv = ['<rootDir>/src/test/testSetup.ts']
export const testEnvironment = 'node'
export const testMatch = ['**/?(*.)spec.ts']
export const moduleNameMapper = {
  '^src/(.*)$': '<rootDir>/src/$1',
}
export const maxWorkers = 1
