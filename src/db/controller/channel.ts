import { DB } from '..'
import {
  Bool,
  ChannelOpenCloseTable,
  ChannelOpenCloseEvent,
  ChannelState,
  ChannelConnectionTable,
} from 'src/types'
import {
  In,
  WhereOptions,
  del,
  insert,
  select,
  selectOne,
  update,
} from '../utils'
import { RESTClient } from 'src/lib/restClient'
import { ConnectionController } from './connection'
import { PacketController, PacketFilter } from './packet'
import { Database } from 'better-sqlite3'

export class ChannelController {
  static tableName = 'channel_open_close'
  static channelConnectionTableName = 'channel_connection'
  public static async feedEvents(
    rest: RESTClient,
    chainId: string,
    events: ChannelOpenCloseEvent[]
  ): Promise<() => void> {
    const feedFns: (() => void)[] = []
    for (const event of events) {
      switch (event.type) {
        case 'channel_open_init':
          feedFns.push(
            await this.feedChannelOpenInitEvent(rest, chainId, event)
          )
          break
        case 'channel_open_try':
          feedFns.push(await this.feedChannelOpenTryEvent(rest, chainId, event))
          break
        case 'channel_open_ack':
          feedFns.push(await this.feedChannelOpenAckEvent(rest, chainId, event))
          break
        case 'channel_open_confirm':
          feedFns.push(
            await this.feedChannelOpenConfirmEvent(rest, chainId, event)
          )
          break
        case 'channel_close':
        case 'channel_close_init':
          feedFns.push(
            await this.feedChannelCloseInitEvent(rest, chainId, event)
          )
          break
        case 'channel_close_confirm':
          feedFns.push(this.feedChannelCloseConfirmEvent(rest, chainId, event))
          break
      }
    }

    return () => {
      for (const fn of feedFns) {
        fn()
      }
    }
  }

  public static getOpenEvent(
    chainId: string,
    counterpartyChainIds: string[],
    filter: PacketFilter = {},
    state?: ChannelState,
    limit = 100
  ): ChannelOpenCloseTable[] {
    const wheres: WhereOptions<ChannelOpenCloseTable>[] = []

    if (filter.connections) {
      for (const connectionFilter of filter.connections) {
        if (connectionFilter.channels) continue
        wheres.push({
          in_progress: Bool.FALSE,
          state,
          chain_id: chainId,
          connection_id: connectionFilter.connectionId,
          counterparty_chain_id: In(counterpartyChainIds),
        })
      }
    } else {
      wheres.push({
        in_progress: Bool.FALSE,
        state,
        chain_id: chainId,
        counterparty_chain_id: In(counterpartyChainIds),
      })
    }

    return select<ChannelOpenCloseTable>(
      DB,
      ChannelController.tableName,
      wheres,
      { id: 'ASC' },
      limit
    )
  }

  public static delOpenEvents(events: ChannelOpenCloseTable[]) {
    if (events.filter((event) => event.id === undefined).length !== 0) {
      throw new Error('id must be exists to remove channel on open')
    }

    if (events.length === 0) return

    del<ChannelOpenCloseTable>(
      DB,
      ChannelController.tableName,
      events.map((v) => ({ id: v.id as number }))
    )
  }

  public static updateInProgress(id?: number, inProgress = true) {
    update<ChannelOpenCloseTable>(
      DB,
      ChannelController.tableName,
      { in_progress: inProgress ? Bool.TRUE : Bool.FALSE },
      [{ id }]
    )
  }

  public static resetPacketInProgress(db?: Database) {
    db = db ?? DB
    update<ChannelOpenCloseTable>(db, ChannelController.tableName, {
      in_progress: Bool.FALSE,
    })
  }

  // executed on the src chain
  private static async feedChannelOpenInitEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelOpenCloseInfo.srcConnectionId
    )

    // add channel on open for dst chain
    const channelOnOpen: ChannelOpenCloseTable = {
      in_progress: Bool.FALSE,
      height: event.channelOpenCloseInfo.height,
      state: ChannelState.INIT,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenCloseInfo.dstPortId,
      channel_id: event.channelOpenCloseInfo.dstChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenCloseInfo.srcConnectionId,
      counterparty_port_id: event.channelOpenCloseInfo.srcPortId,
      counterparty_channel_id: event.channelOpenCloseInfo.srcChannelId,
    }

    return () => {
      insert(DB, ChannelController.tableName, channelOnOpen) // store INIT state to the dst chain
    }
  }

  // executed on the dst chain
  private static async feedChannelOpenTryEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelOpenCloseInfo.dstConnectionId
    )

    // add channel on open for src chain
    const channelOnOpen: ChannelOpenCloseTable = {
      in_progress: Bool.FALSE,
      height: event.channelOpenCloseInfo.height,
      state: ChannelState.TRYOPEN,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenCloseInfo.srcPortId,
      channel_id: event.channelOpenCloseInfo.srcChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenCloseInfo.dstConnectionId,
      counterparty_port_id: event.channelOpenCloseInfo.dstPortId,
      counterparty_channel_id: event.channelOpenCloseInfo.dstChannelId,
    }

    return () => {
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.INIT,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: channelOnOpen.port_id,
          counterparty_channel_id: channelOnOpen.channel_id,
        },
      ]) // remove INIT from the dst chain
      insert(DB, ChannelController.tableName, channelOnOpen) // store TRYOPEN state to the src chain
    }
  }

  // executed on the src chain
  private static async feedChannelOpenAckEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelOpenCloseInfo.srcConnectionId
    )

    // add channel on open for dst chain
    const channelOnOpen: ChannelOpenCloseTable = {
      in_progress: Bool.FALSE,
      height: event.channelOpenCloseInfo.height,
      state: ChannelState.ACK,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenCloseInfo.dstPortId,
      channel_id: event.channelOpenCloseInfo.dstChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenCloseInfo.srcConnectionId,
      counterparty_port_id: event.channelOpenCloseInfo.srcPortId,
      counterparty_channel_id: event.channelOpenCloseInfo.srcChannelId,
    }

    return () => {
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.TRYOPEN,
          counterparty_chain_id: channelOnOpen.chain_id,
          counterparty_port_id: channelOnOpen.port_id,
          counterparty_channel_id: channelOnOpen.channel_id,
        },
      ]) // remove TRYOPEN from src chain
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.INIT,
          counterparty_chain_id: chainId,
          counterparty_port_id: channelOnOpen.counterparty_port_id,
          counterparty_channel_id: channelOnOpen.counterparty_channel_id,
        },
      ]) // remove INIT from dst chain
      insert(DB, ChannelController.tableName, channelOnOpen) // store ACK state to the dst chain
    }
  }

  // executed on the dst chain
  private static async feedChannelOpenConfirmEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelOpenCloseInfo.dstConnectionId
    )
    return () => {
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.TRYOPEN,
          counterparty_chain_id: chainId,
          counterparty_port_id: event.channelOpenCloseInfo.dstPortId,
          counterparty_channel_id: event.channelOpenCloseInfo.dstChannelId,
        },
      ]) // remove TRYOPEN from src chain
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.ACK,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelOpenCloseInfo.srcPortId,
          counterparty_channel_id: event.channelOpenCloseInfo.srcChannelId,
        },
      ]) // remove ACK from dst chain
    }
  }

  private static async feedChannelCloseInitEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelOpenCloseInfo.srcConnectionId
    )

    // add channel on open for dst chain
    const channelOnOpen: ChannelOpenCloseTable = {
      in_progress: Bool.FALSE,
      height: event.channelOpenCloseInfo.height,
      state: ChannelState.CLOSE,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenCloseInfo.dstPortId,
      channel_id: event.channelOpenCloseInfo.dstChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenCloseInfo.srcConnectionId,
      counterparty_port_id: event.channelOpenCloseInfo.srcPortId,
      counterparty_channel_id: event.channelOpenCloseInfo.srcChannelId,
    }

    return () => {
      insert(DB, ChannelController.tableName, channelOnOpen)

      // Mark all packets as timed out
      PacketController.updateTimeout(
        chainId,
        event.channelOpenCloseInfo.srcChannelId
      )
    }
  }

  private static feedChannelCloseConfirmEvent(
    _rest: RESTClient,
    chainId: string,
    event: ChannelOpenCloseEvent
  ): () => void {
    return () => {
      del<ChannelOpenCloseTable>(DB, ChannelController.tableName, [
        {
          state: ChannelState.CLOSE,
          chain_id: chainId,
          port_id: event.channelOpenCloseInfo.dstPortId,
          channel_id: event.channelOpenCloseInfo.dstChannelId,
        },
      ])
      // Mark all packets as timed out
      PacketController.updateTimeout(
        chainId,
        event.channelOpenCloseInfo.srcChannelId
      )
    }
  }

  // channel_connection
  public static async addChannelConnection(
    rest: RESTClient,
    chainId: string,
    portId: string,
    channelId: string
  ): Promise<ChannelConnectionTable> {
    const channelInfo = await rest.ibc.channel(portId, channelId)

    const channelConnection: ChannelConnectionTable = {
      chain_id: chainId,
      channel_id: channelId,
      connection_id: channelInfo.channel.connection_hops[0],
    }

    insert(DB, ChannelController.channelConnectionTableName, channelConnection)

    return channelConnection
  }

  public static async getChannelConnection(
    rest: RESTClient,
    chainId: string,
    portId: string,
    channelId: string
  ): Promise<ChannelConnectionTable> {
    const channelConnection = selectOne<ChannelConnectionTable>(
      DB,
      ChannelController.channelConnectionTableName,
      [
        {
          chain_id: chainId,
          channel_id: channelId,
        },
      ]
    )

    return (
      channelConnection ??
      this.addChannelConnection(rest, chainId, portId, channelId)
    )
  }
}
