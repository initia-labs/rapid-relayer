import express from 'express'
import { registry } from './lib/metric'
import { info } from './lib/logger'

import { config } from './lib/config'
import { WorkerController } from './workers'
import { initDBConnection } from './db'
import { initSentry } from './lib/sentry'

async function main() {
  initSentry('rapid-relayer')
  initDBConnection()
  const workerController = new WorkerController()
  await workerController.init(config)
  const app = express()

  app.get('/status', (req, res) => {
    res.json(workerController.getStatus())
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
}

void main()
