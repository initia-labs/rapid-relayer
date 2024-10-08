import { DB } from '..'
import {
  Boolean,
  ChannelOnOpenTable,
  ChannelOpenEvent,
  ChannelState,
} from 'src/types'
import { In, WhereOptions, del, insert, select, update } from '../utils'
import { LCDClient } from 'src/lib/lcdClient'
import { ConnectionController } from './connection'
import { PacketFilter } from './packet'
import { Database } from 'better-sqlite3'

export class ChannelController {
  static tableName = 'channel_on_open'
  public static async feedEvents(
    lcd: LCDClient,
    chainId: string,
    events: ChannelOpenEvent[]
  ): Promise<() => void> {
    const feedFns: (() => void)[] = []
    for (const event of events) {
      switch (event.type) {
        case 'channel_open_init':
          feedFns.push(await this.feedChannelOpenInitEvent(lcd, chainId, event))
          break
        case 'channel_open_try':
          feedFns.push(await this.feedChannelOpenTryEvent(lcd, chainId, event))
          break
        case 'channel_open_ack':
          feedFns.push(await this.feedChannelOpenAckEvent(lcd, chainId, event))
          break
        case 'channel_open_confirm':
          feedFns.push(
            await this.feedChannelOpenConfirmEvent(lcd, chainId, event)
          )
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
  ): ChannelOnOpenTable[] {
    const wheres: WhereOptions<ChannelOnOpenTable>[] = []

    if (filter.connections) {
      for (const connectionFilter of filter.connections) {
        if (connectionFilter.channels) continue
        wheres.push({
          in_progress: Boolean.FALSE,
          state,
          chain_id: chainId,
          connection_id: connectionFilter.connectionId,
          counterparty_chain_id: In(counterpartyChainIds),
        })
      }
    } else {
      wheres.push({
        in_progress: Boolean.FALSE,
        state,
        chain_id: chainId,
        counterparty_chain_id: In(counterpartyChainIds),
      })
    }

    return select<ChannelOnOpenTable>(
      DB,
      this.tableName,
      wheres,
      { id: 'ASC' },
      limit
    )
  }

  public static delOpenEvents(events: ChannelOnOpenTable[]) {
    if (events.filter((event) => event.id === undefined).length !== 0) {
      throw new Error('id must be exists to remove channel on open')
    }

    if (events.length === 0) return

    del<ChannelOnOpenTable>(
      DB,
      this.tableName,
      events.map((v) => ({ id: v.id as number }))
    )
  }

  public static updateInProgress(id?: number, inProgress = true) {
    update<ChannelOnOpenTable>(
      DB,
      this.tableName,
      { in_progress: inProgress ? Boolean.TRUE : Boolean.FALSE },
      [{ id }]
    )
  }

  public static resetPacketInProgress(db?: Database) {
    db = db ?? DB
    update<ChannelOnOpenTable>(db, this.tableName, {
      in_progress: Boolean.FALSE,
    })
  }

  private static async feedChannelOpenInitEvent(
    lcd: LCDClient,
    chainId: string,
    event: ChannelOpenEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.channelOpenInfo.srcConnectionId
    )

    // add channel on open for dst chain
    const channelOnOpen: ChannelOnOpenTable = {
      in_progress: Boolean.FALSE,
      state: ChannelState.INIT,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenInfo.dstPortId,
      channel_id: event.channelOpenInfo.dstChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenInfo.srcConnectionId,
      counterparty_port_id: event.channelOpenInfo.srcPortId,
      counterparty_channel_id: event.channelOpenInfo.srcChannelId,
    }

    return () => {
      insert(DB, this.tableName, channelOnOpen)
    }
  }

  private static async feedChannelOpenTryEvent(
    lcd: LCDClient,
    chainId: string,
    event: ChannelOpenEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.channelOpenInfo.dstConnectionId
    )

    // add channel on open for src chain
    const channelOnOpen: ChannelOnOpenTable = {
      in_progress: Boolean.FALSE,
      state: ChannelState.TRYOPEN,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenInfo.srcPortId,
      channel_id: event.channelOpenInfo.srcChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenInfo.dstConnectionId,
      counterparty_port_id: event.channelOpenInfo.dstPortId,
      counterparty_channel_id: event.channelOpenInfo.dstChannelId,
    }

    return () => {
      del<ChannelOnOpenTable>(DB, this.tableName, [
        {
          state: ChannelState.INIT,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: channelOnOpen.port_id,
          counterparty_channel_id: channelOnOpen.channel_id,
        },
      ]) // remove init
      insert(DB, this.tableName, channelOnOpen)
    }
  }

  private static async feedChannelOpenAckEvent(
    lcd: LCDClient,
    chainId: string,
    event: ChannelOpenEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.channelOpenInfo.srcConnectionId
    )

    // add channel on open for dst chain
    const channelOnOpen: ChannelOnOpenTable = {
      in_progress: Boolean.FALSE,
      state: ChannelState.ACK,
      chain_id: connection.counterparty_chain_id,
      connection_id: connection.counterparty_connection_id,
      port_id: event.channelOpenInfo.dstPortId,
      channel_id: event.channelOpenInfo.dstChannelId,
      counterparty_chain_id: chainId,
      counterparty_connection_id: event.channelOpenInfo.srcConnectionId,
      counterparty_port_id: event.channelOpenInfo.srcPortId,
      counterparty_channel_id: event.channelOpenInfo.srcChannelId,
    }

    return () => {
      del<ChannelOnOpenTable>(DB, this.tableName, [
        {
          state: ChannelState.INIT,
          counterparty_chain_id: chainId,
          counterparty_port_id: channelOnOpen.counterparty_port_id,
          counterparty_channel_id: channelOnOpen.counterparty_channel_id,
        },
      ]) // remove init
      insert(DB, this.tableName, channelOnOpen)
    }
  }

  private static async feedChannelOpenConfirmEvent(
    _lcd: LCDClient,
    chainId: string,
    event: ChannelOpenEvent
  ): Promise<() => void> {
    return () => {
      del<ChannelOnOpenTable>(DB, this.tableName, [
        {
          state: ChannelState.TRYOPEN,
          counterparty_chain_id: chainId,
          counterparty_port_id: event.channelOpenInfo.srcPortId,
          counterparty_channel_id: event.channelOpenInfo.srcChannelId,
        },
      ]) // remove open try
      del<ChannelOnOpenTable>(DB, this.tableName, [
        {
          state: ChannelState.ACK,
          counterparty_chain_id: chainId,
          counterparty_port_id: event.channelOpenInfo.dstPortId,
          counterparty_channel_id: event.channelOpenInfo.dstChannelId,
        },
      ]) // remove ack
    }
  }
}
