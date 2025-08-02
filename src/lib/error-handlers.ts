import { captureException } from './sentry'
import { error } from './logger'

export function setupErrorHandlers(): void {
  process.on('unhandledRejection', (err: unknown) => {
    error('Unhandled rejection: ' + String(err))

    const errorObject =
      err instanceof Error
        ? err
        : new Error(typeof err === 'string' ? err : JSON.stringify(err))

    void captureException(errorObject)

    setTimeout(() => process.exit(1), 1000)
  })

  process.on('uncaughtException', (err) => {
    error('Uncaught exception: ' + String(err))

    void captureException(err)

    setTimeout(() => process.exit(1), 1000)
  })
}
