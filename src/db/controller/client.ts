import { DB } from '..'
import { insert, selectOne } from '../utils'
import { Any } from 'cosmjs-types/google/protobuf/any'
import { ClientState, UpdateClientEvent, ClientTable } from 'src/types'
import { Header } from 'cosmjs-types/ibc/lightclients/tendermint/v1/tendermint'
import { LCDClient } from '@initia/initia.js'

export class ClientController {
  static tableName = 'client'
  public static async addClient(
    lcd: LCDClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    const state = await lcd.apiRequester.get<ClientState>(
      `/ibc/core/client/v1/client_states/${clientId}`
    )

    const client: ClientTable = {
      chain_id: chainId,
      client_id: clientId,
      counterparty_chain_id: state.client_state.chain_id,
      trusting_period: parseInt(
        state.client_state.trusting_period.replace('s', '')
      ),
      revision_height: parseInt(
        state.client_state.latest_height.revision_height
      ),
      last_update_time: 0,
    }

    insert(DB, this.tableName, client)

    return client
  }

  public static async feedUpdateClientEvent(
    lcd: LCDClient,
    chainId: string,
    event: UpdateClientEvent
  ) {
    // create key
    const clientId = event.clientId

    // decode header
    const msg = Any.decode(
      new Uint8Array([...Buffer.from(event.header, 'hex')])
    )
    if (msg.typeUrl !== '/ibc.lightclients.tendermint.v1.Header') return
    const header = Header.decode(msg.value)

    // get client
    const client = await this.getClient(lcd, chainId, clientId)

    // update client
    client.revision_height = parseInt(
      event.consensusHeights.split(',')[0].split('-')[1]
    )

    if (header.signedHeader?.header?.time.seconds) {
      client.last_update_time = Number(header.signedHeader.header.time.seconds)
    }

    insert(DB, this.tableName, client)
  }

  public static async getClient(
    lcd: LCDClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    // get client
    const client = selectOne<ClientTable>(DB, this.tableName, [
      {
        chain_id: chainId,
        client_id: clientId,
      },
    ])

    return client ?? this.addClient(lcd, chainId, clientId)
  }
}
