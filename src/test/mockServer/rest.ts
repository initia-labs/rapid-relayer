import { ClientState, ConnectionInfo } from 'src/types'
import { RESTClient } from 'src/lib/restClient'
import { APIRequester } from '@initia/initia.js'

export class RestMockServer {
  public connections: Record<string, ConnectionInfo>
  private clients: Record<string, ClientState>
  constructor(
    public chainId: string,
    public restUri: string
  ) {
    this.connections = {}
    this.clients = {}
  }

  client(): RESTClient {
    return new RESTClient(
      this.restUri,
      undefined,
      new APIRequester(this.restUri, { timeout: 500 })
    )
  }

  addConnection(connectionId: string, connectionInfo: ConnectionInfo) {
    // check client exists
    if (this.clients[connectionInfo.connection.client_id] === undefined) {
      throw Error('client not found')
    }
    this.connections[connectionId] = connectionInfo
  }

  getConnection(connectionId: string): ConnectionInfo {
    return this.connections[connectionId]
  }

  addClientState(clientId: string, clientState: ClientState) {
    this.clients[clientId] = clientState
  }

  getClientState(clientId: string): ClientState {
    return this.clients[clientId]
  }
}
