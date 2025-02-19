import * as Sentry from '@sentry/node'
import '@sentry/tracing'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { setupErrorHandlers } from './error-handlers'

export async function captureException(
  error: Error,
  level: Sentry.SeverityLevel = 'error'
) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    return
  }

  Sentry.withScope((scope) => {
    scope.setLevel(level)
    Sentry.captureException(error)
  })

  // Wait for events to be sent, with a 1 second timeout
  await Sentry.flush(1000).catch(() => undefined)
}

export function initSentry(serverName: string) {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.warn('Sentry DSN not configured, skipping initialization')
    return
  }

  const env = process.env.SENTRY_ENVIRONMENT
  const release = process.env.SENTRY_RELEASE
  const tracesSampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.01'
  )
  const profilesSampleRate = Number(
    process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.01'
  )

  Sentry.init({
    dsn,
    serverName,
    environment: env || 'development',
    release,
    tracesSampleRate,
    profilesSampleRate,
    enableTracing: true,
    integrations: [nodeProfilingIntegration()],
    initialScope: {
      tags: {
        component: serverName,
        l1_chain_id: process.env.SENTRY_L1_CHAIN_ID,
        l2_chain_id: process.env.SENTRY_L2_CHAIN_ID,
      },
    },
  })

  // Set up error handlers after Sentry is initialized
  setupErrorHandlers()

  console.log(`Sentry initialized:
    server_name: ${serverName}
    dsn: ${dsn}
    env: ${env || 'development'}
    release: ${release || 'unspecified'}
    traces_sample_rate: ${tracesSampleRate}
    profiles_sample_rate: ${profilesSampleRate}
  `)
}
