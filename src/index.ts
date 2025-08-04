import express from 'express'
import { registry } from './lib/metric'
import { info } from './lib/logger'

import { config } from './lib/config'
import { RaftWorkerController } from './workers/raftWorker'
import { initDBConnection } from './db'
import { initSentry } from './lib/sentry'

async function main() {
  initSentry('rapid-relayer')
  initDBConnection()

  const workerController = new RaftWorkerController(config)
  await workerController.init()

  const app = express()
  app.use(express.json())

  app.get('/status', (req, res) => {
    res.json(workerController.getStatus())
  })

  app.get('/raft/status', (req, res) => {
    res.json({
      isLeader: workerController.isLeader(),
      isActive: workerController.isActiveNode(),
      clusterStatus: workerController.getStatus().raft,
    })
  })

  app.post('/raft/command', (req, res) => {
    void (async () => {
      try {
        const { command, data } = req.body as {
          command: string
          data: Record<string, unknown>
        }
        await workerController.sendCommandToLeader(command, data)
        res.json({ success: true, message: 'Command sent to leader' })
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        res.status(500).json({ success: false, error: errorMessage })
      }
    })()
  })

  app.post('/raft/sync', (req, res) => {
    void (async () => {
      try {
        await workerController.requestSyncFromLeader()
        res.json({ success: true, message: 'Sync request sent to leader' })
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        res.status(500).json({ success: false, error: errorMessage })
      }
    })()
  })

  const metricApp = express()

  metricApp.get('/metrics', (req, res) => {
    res.setHeader('content-type', registry.contentType)
    registry
      .metrics()
      .then((response) => res.send(response))
      .catch(() => res.status(500).send('Fail to get metrics'))
  })

  app.listen(config.port)
  info(`status app listen to port ${config.port}`)
  info(`rapid relayer has been started`)
  info(JSON.stringify(workerController.getStatus(), undefined, 2))

  metricApp.listen(config.metricPort)
  info(`metric app listen to port ${config.metricPort}`)

  // Set up graceful shutdown
  process.on('SIGINT', () => {
    info('Shutting down...')
    workerController.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    info('Shutting down...')
    workerController.stop()
    process.exit(0)
  })
}

void main()
