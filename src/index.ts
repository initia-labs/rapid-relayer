// import { Chain } from './chain'
// import express from 'express'
// import { runPair } from './lib/chainPair'
// import { config } from './lib/config'
// import { ChainStatus } from './chain/types'
// import { registery } from './lib/metric'
// import { info } from './lib/logger'

import { config } from './lib/config'
import { WorkerController } from './workers'

async function main() {
  const workerController = new WorkerController()
  await workerController.init(config)

  // const app = express()

  // app.get('/status', (req, res) => {
  //   const result: Record<string, { chainA: ChainStatus; chainB: ChainStatus }> =
  //     {}
  //   Object.keys(pairs).map((name) => {
  //     result[name] = {
  //       chainA: pairs[name].chainA.chainStatus(),
  //       chainB: pairs[name].chainB.chainStatus(),
  //     }
  //   })

  //   res.json(result)
  // })

  // const metricApp = express()

  // metricApp.get('/metrics', (req, res) => {
  //   res.setHeader('content-type', registery.contentType)
  //   registery
  //     .metrics()
  //     .then((response) => res.send(response))
  //     .catch(() => res.status(500).send('Fail to get metrics'))
  // })

  // app.listen(config.port)
  // info(`status app listen to port ${config.port}`)
  // metricApp.listen(config.metricPort)
  // info(`metric app listen to port ${config.metricPort}`)
}

void main()
