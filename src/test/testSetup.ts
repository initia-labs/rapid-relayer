import 'tsconfig-paths/register'
import { env } from 'node:process'
env.CONFIGFILE = 'src/test/config.test.json'
import { config } from 'src/lib/config'
import * as fs from 'fs'
import { initDBConnection } from 'src/db'
import { RestMockServer } from './mockServer/rest'
import { http, RequestHandler, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { SetupServerApi } from 'msw/node'

export let mockServers: { rest: RestMockServer }[] = []
let server: SetupServerApi | undefined

const firstUri = (uri: string | string[]): string => {
  if (Array.isArray(uri)) {
    if (uri.length === 0) {
      throw new Error('restUri must contain at least one entry')
    }
    return uri[0]
  }
  return uri
}

const shouldBypassUnhandledRequest = (request: Request): boolean => {
  const hostname = new URL(request.url).hostname
  return /^(doi|moro|rene)-(rest|rpc)-\d+\.com$/.test(hostname)
}

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
    const restUri = firstUri(chain.restUri)
    const restServer = new RestMockServer(chain.chainId, restUri)

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
        new URL('/ibc/core/connection/v1/connections/:connectionId', restUri)
          .href,
        ({ params }) => {
          const { connectionId } = params
          // ...and respond to them using this JSON response.
          try {
            const connectionInfo = restServer.getConnection(
              connectionId as string
            )
            return HttpResponse.json(connectionInfo)
          } catch {
            return new HttpResponse('Failed to retrieve connection info', {
              status: 500,
            })
          }
        }
      )
    )

    handlers.push(
      http.get(
        new URL('/ibc/core/client/v1/client_states/:clientId', restUri).href,
        ({ params }) => {
          const { clientId } = params

          try {
            const clientState = restServer.getClientState(clientId as string)
            return HttpResponse.json(clientState)
          } catch {
            return new HttpResponse('Failed to retrieve client info', {
              status: 500,
            })
          }
        }
      )
    )

    handlers.push(
      http.get(
        new URL(
          '/ibc/core/client/v1/consensus_states/:clientId/revision/0/height/0',
          restUri
        ).href,
        () => {
          return HttpResponse.json({
            consensus_state: {
              '@type': 'mock',
              timestamp: new Date().toISOString(),
              root: {
                hash: '',
              },
              next_validators_hash: '',
            },
            proof: '',
            proof_height: {
              revision_number: '0',
              revision_height: '0',
            },
          })
        }
      )
    )

    return { rest: restServer }
  })

  server = setupServer(...handlers)
  server.listen({
    onUnhandledRequest(request, print) {
      if (shouldBypassUnhandledRequest(request)) {
        return
      }

      print.warning()
    },
  })
}

beforeAll(() => setup())

afterAll(() => {
  server?.close()
  server = undefined
})
