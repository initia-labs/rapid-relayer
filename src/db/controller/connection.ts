import { DB } from '..'
import { ConnectionTable } from 'src/types'
import { ClientController } from './client'
import { insert, selectOne } from '../utils'
import { RESTClient } from 'src/lib/restClient'

export class ConnectionController {
  static tableName = 'connection'
  public static async addConnection(
    rest: RESTClient,
    chainId: string,
    connectionId: string
  ): Promise<ConnectionTable> {
    const connectionInfo = await rest.ibc.getConnection(connectionId)
    const clientId = connectionInfo.connection.client_id
    const client = await ClientController.getClient(rest, chainId, clientId)

    const connection: ConnectionTable = {
      chain_id: chainId,
      connection_id: connectionId,
      client_id: client.client_id,
      counterparty_chain_id: client.counterparty_chain_id,
      counterparty_connection_id:
        connectionInfo.connection.counterparty.connection_id,
      counterparty_client_id: connectionInfo.connection.counterparty.client_id,
    }

    insert(DB, ConnectionController.tableName, connection)

    return connection
  }

  // TODO: add connection_open_init event feeder

  public static async getConnection(
    rest: RESTClient,
    chainId: string,
    connectionId: string
  ): Promise<ConnectionTable> {
    const connection = selectOne<ConnectionTable>(
      DB,
      ConnectionController.tableName,
      [
        {
          chain_id: chainId,
          connection_id: connectionId,
        },
      ]
    )

    return connection ?? this.addConnection(rest, chainId, connectionId)
  }
}
