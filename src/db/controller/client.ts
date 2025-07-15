import { DB } from '..'
import { del, insert, select, selectOne, update } from '../utils'
import { Any } from 'cosmjs-types/google/protobuf/any'
import { UpdateClientEvent, ClientTable } from 'src/types'
import { Header } from 'cosmjs-types/ibc/lightclients/tendermint/v1/tendermint'
import { RESTClient } from 'src/lib/restClient'
import { PacketController } from './packet'
import { ChannelController } from './channel'
import { createLoggerWithPrefix } from 'src/lib/logger'

export class ClientController {
  static tableName = 'client'
  private static logger = createLoggerWithPrefix('[ClientController] ')

  public static async addClient(
    rest: RESTClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    this.logger.info(`addClient: chainId=${chainId}, clientId=${clientId}`)
    const client = await ClientController.fetchClient(rest, chainId, clientId)

    this.logger.info(`insert: table=${this.tableName}, chainId=${chainId}, clientId=${clientId}`)
    insert(DB, ClientController.tableName, client)

    return client
  }

  public static async replaceClient(
    rest: RESTClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    this.logger.info(`replaceClient: chainId=${chainId}, clientId=${clientId}`)
    const client = await ClientController.fetchClient(rest, chainId, clientId)

    this.logger.info(`delete: table=${this.tableName}, chainId=${chainId}, clientId=${clientId}`)
    del(DB, ClientController.tableName, [
      { chain_id: chainId, client_id: clientId },
    ])
    this.logger.info(`insert: table=${this.tableName}, chainId=${chainId}, clientId=${clientId}`)
    insert(DB, ClientController.tableName, client)

    // to recheck packets
    PacketController.resetPacketInProgress()
    // to recheck channel
    ChannelController.resetPacketInProgress()

    return client
  }

  public static async feedUpdateClientEvent(
    rest: RESTClient,
    chainId: string,
    event: UpdateClientEvent
  ) {
    // create key
    const clientId = event.clientId
    this.logger.info(`feedUpdateClientEvent: chainId=${chainId}, clientId=${clientId}`)

    // decode header
    const msg = Any.decode(
      new Uint8Array([...Buffer.from(event.header, 'hex')])
    )
    if (msg.typeUrl !== '/ibc.lightclients.tendermint.v1.Header') return
    const header = Header.decode(msg.value)

    // get client
    const client = await this.getClient(rest, chainId, clientId)

    // update client
    const splitted = event.consensusHeights.split(',')[0].split('-')
    if (splitted.length < 2) {
      throw new Error(
        'Invalid consensusHeights format. Expected "revision-height"'
      )
    }

    const revisionHeight = parseInt(splitted[1])

    if (revisionHeight > client.revision_height) {
      client.revision_height = revisionHeight
    }

    if (header.signedHeader?.header?.time.seconds) {
      const lastUpdateTime = Number(header.signedHeader.header.time.seconds)
      if (lastUpdateTime > client.last_update_time) {
        client.last_update_time = lastUpdateTime
      }
    }

    this.logger.info(`update: table=${this.tableName}, chainId=${chainId}, clientId=${clientId}`)
    update<ClientTable>(
      DB,
      ClientController.tableName,
      {
        revision_height: client.revision_height,
        last_update_time: client.last_update_time,
      },
      [
        {
          chain_id: client.chain_id,
          client_id: client.client_id,
        },
      ]
    )
  }

  public static async getClient(
    rest: RESTClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    this.logger.info(`getClient: chainId=${chainId}, clientId=${clientId}`)
    // get client
    const client = selectOne<ClientTable>(DB, ClientController.tableName, [
      {
        chain_id: chainId,
        client_id: clientId,
      },
    ])

    return client ?? this.addClient(rest, chainId, clientId)
  }

  public static getClientsToUpdate(
    chainId: string,
    counterpartyChainIds: string[]
  ): ClientTable[] {
    this.logger.info(`getClientsToUpdate: chainId=${chainId}, counterpartyChainIds=${counterpartyChainIds.join(',')}`)
    const clients = select<ClientTable>(
      DB,
      ClientController.tableName,
      counterpartyChainIds.map((counterpartyChainId) => ({
        chain_id: chainId,
        counterparty_chain_id: counterpartyChainId,
      }))
    )

    // check need updates
    const currentTimestamp = new Date().valueOf() / 1000

    return clients.filter((client) => {
      // check expired
      if (client.last_update_time + client.trusting_period < currentTimestamp) {
        return false
      }

      // check need update
      if (
        client.last_update_time + client.trusting_period * 0.666 <
        currentTimestamp
      ) {
        return true
      }

      return false
    })
  }

  public static async fetchClient(
    rest: RESTClient,
    chainId: string,
    clientId: string
  ): Promise<ClientTable> {
    const state = await rest.ibc.getClientState(clientId)

    // get latest cons state
    const consState = await rest.ibc.lastConsensusState(clientId)

    return {
      chain_id: chainId,
      client_id: clientId,
      counterparty_chain_id: state.client_state.chain_id,
      trusting_period: parseInt(
        state.client_state.trusting_period.replace('s', '')
      ),
      revision_height: parseInt(
        state.client_state.latest_height.revision_height
      ),
      last_update_time: Math.floor(
        new Date(consState.consensus_state.timestamp).valueOf() / 1000
      ),
    }
  }
}
