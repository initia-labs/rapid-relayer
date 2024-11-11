import 'tsconfig-paths/register'
import { env } from 'node:process'
env.CONFIGFILE = 'src/test/config.test.json'
import { config } from 'src/lib/config'
import * as fs from 'fs'
import { initDBConnection } from 'src/db'
import { RestMockServer } from './mockServer/rest'
import { http, RequestHandler, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export let mockServers: { rest: RestMockServer }[] = []

const setup = () => {
  // remove db
  const dbPath = config.dbPath as string

  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { recursive: true })
  }

  fs.mkdirSync(dbPath)

  // init db and mock server
  initDBConnection()
  const handlers: RequestHandler[] = []
  mockServers = config.chains.map((chain, i) => {
    const index = i + 1
    const counterpartyIndex = index + (index % 2 === 0 ? -1 : 1)
    const restServer = new RestMockServer(chain.chainId, chain.restUri)

    restServer.addClientState(`07-tendermint-${index}`, {
      client_state: {
        chain_id: config.chains[counterpartyIndex - 1].chainId,
        trusting_period: '3000s',
        latest_height: {
          revision_height: `${index}-100`,
        },
      },
    })
    restServer.addConnection(`connection-${index}`, {
      connection: {
        client_id: `07-tendermint-${index}`,
        counterparty: {
          client_id: `07-tendermint-${counterpartyIndex}`,
          connection_id: `connection-${counterpartyIndex}`,
        },
      },
    })

    handlers.push(
      http.get(
        new URL(
          '/ibc/core/connection/v1/connections/:connectionId',
          chain.restUri
        ).href,
        ({ params }) => {
          const { connectionId } = params
          // ...and respond to them using this JSON response.
          try {
            const connectionInfo = restServer.getConnection(
              connectionId as string
            )
            return HttpResponse.json(connectionInfo)
          } catch (error) {
            return new HttpResponse('Failed to retrieve connection info', {
              status: 500,
            })
          }
        }
      )
    )

    handlers.push(
      http.get(
        new URL('/ibc/core/client/v1/client_states/:clientId', chain.restUri)
          .href,
        ({ params }) => {
          const { clientId } = params

          try {
            const clientState = restServer.getClientState(clientId as string)
            return HttpResponse.json(clientState)
          } catch (error) {
            return new HttpResponse('Failed to retrieve client info', {
              status: 500,
            })
          }
        }
      )
    )

    return { rest: restServer }
  })

  setupServer(...handlers).listen()
}

beforeAll(() => setup())
