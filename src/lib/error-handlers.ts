import { captureException } from './sentry'

export function setupErrorHandlers(): void {
  process.on('unhandledRejection', (error: unknown) => {
    console.error('Unhandled rejection:', error)

    const errorObject =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : JSON.stringify(error))

    void captureException(errorObject)

    setTimeout(() => process.exit(1), 1000)
  })

  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error)

    void captureException(error)

    setTimeout(() => process.exit(1), 1000)
  })
}
