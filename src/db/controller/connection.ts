import { DB } from '..'
import { ConnectionTable } from 'src/types'
import { ClientController } from './client'
import { insert, selectOne } from '../utils'
import { LCDClient } from 'src/lib/lcdClient'

export class ConnectionController {
  static tableName = 'connection'
  public static async addConnection(
    lcd: LCDClient,
    chainId: string,
    connectionId: string
  ): Promise<ConnectionTable> {
    const connectionInfo = await lcd.ibc.getConnection(connectionId)

    const clientId = connectionInfo.connection.client_id
    const client = await ClientController.getClient(lcd, chainId, clientId)

    const connection: ConnectionTable = {
      chain_id: chainId,
      connection_id: connectionId,
      client_id: client.client_id,
      counterparty_chain_id: client.counterparty_chain_id,
      counterparty_connection_id:
        connectionInfo.connection.counterparty.connection_id,
      counterparty_client_id: connectionInfo.connection.counterparty.client_id,
    }

    insert(DB, this.tableName, connection)

    return connection
  }

  // TODO: add connection_open_init event feeder

  public static async getConnection(
    lcd: LCDClient,
    chainId: string,
    connectionId: string
  ): Promise<ConnectionTable> {
    const connection = selectOne<ConnectionTable>(DB, this.tableName, [
      {
        chain_id: chainId,
        connection_id: connectionId,
      },
    ])

    return connection ?? this.addConnection(lcd, chainId, connectionId)
  }
}