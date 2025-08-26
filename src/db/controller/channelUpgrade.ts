import { DB } from 'src/db'
import {
  ChannelUpgradeTable,
  ChannelState,
  Bool,
  ChannelUpgradeEvent,
  ConnectionTable,
} from 'src/types'
import { update, del, select, WhereOptions, In, insert } from '../utils'
import { PacketFilter } from './packet'
import { RESTClient } from 'src/lib/restClient'
import { ConnectionController } from './connection'
import { Database } from 'better-sqlite3'
import { createLoggerWithPrefix } from 'src/lib/logger'

export class ChannelUpgradeController {
  static tableName = 'channel_upgrade'
  private static logger = createLoggerWithPrefix('[ChannelUpgradeController] ')

  static async feedEvents(
    rest: RESTClient,
    chainId: string,
    events: ChannelUpgradeEvent[]
  ): Promise<() => void> {
    ChannelUpgradeController.logger.info(
      `feedEvents: chainId=${chainId}, events.length=${events.length}`
    )
    const feedFns: (() => void)[] = []
    for (const event of events) {
      switch (event.type) {
        case 'channel_upgrade_init':
          feedFns.push(await this.feedUpgradeInitEvent(rest, chainId, event))
          break
        case 'channel_upgrade_try':
          feedFns.push(await this.feedUpgradeTryEvent(rest, chainId, event))
          break
        case 'channel_upgrade_ack':
          feedFns.push(await this.feedUpgradeAckEvent(rest, chainId, event))
          break
        case 'channel_upgrade_confirm':
          feedFns.push(await this.feedUpgradeConfirmEvent(rest, chainId, event))
          break
        case 'channel_upgrade_open':
          feedFns.push(await this.feedUpgradeOpenEvent(rest, chainId, event))
          break
        case 'channel_upgrade_error':
          feedFns.push(await this.feedUpgradeErrorEvent(rest, chainId, event))
          break
      }
    }

    return () => {
      for (const fn of feedFns) {
        fn()
      }
    }
  }

  static async getOriginConnection(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<ConnectionTable> {
    const channel = await rest.ibc.channel(
      event.channelUpgradeInfo.srcPortId,
      event.channelUpgradeInfo.srcChannelId
    )
    const connection_id = channel.channel.connection_hops[0]
    return await ConnectionController.getConnection(
      rest,
      chainId,
      connection_id
    )
  }

  static async feedUpgradeInitEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const origin_connection =
      await ChannelUpgradeController.getOriginConnection(rest, chainId, event)
    const upgrade_connection_id = event.channelUpgradeInfo
      .upgradeConnectionHops as string
    const upgrade_connection = await ConnectionController.getConnection(
      rest,
      chainId,
      upgrade_connection_id
    )

    const channelUpgradeTry: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_TRY,

      chain_id: origin_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: origin_connection.counterparty_connection_id,
      upgrade_connection_id: upgrade_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: origin_connection.connection_id,
      counterparty_upgrade_connection_id: upgrade_connection.connection_id,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeTry) // store TRY state to the dst chain
    }
  }

  static async feedUpgradeTryEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    ChannelUpgradeController.logger.info(
      `feedUpgradeTryEvent: chainId=${chainId}, event=${JSON.stringify(event)}`
    )

    const origin_connection =
      await ChannelUpgradeController.getOriginConnection(rest, chainId, event)
    const upgrade_connection_id = event.channelUpgradeInfo
      .upgradeConnectionHops as string
    const upgrade_connection = await ConnectionController.getConnection(
      rest,
      chainId,
      upgrade_connection_id
    )

    const channelUpgradeAck: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_ACK,

      chain_id: origin_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: origin_connection.counterparty_connection_id,
      upgrade_connection_id: upgrade_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: origin_connection.connection_id,
      counterparty_upgrade_connection_id: upgrade_connection.connection_id,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_TRY,
          counterparty_chain_id: origin_connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
          upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
        },
      ]) // remove INIT from the dst chain
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeAck) // store ACK state to the src chain
    }
  }

  static async feedUpgradeAckEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const origin_connection =
      await ChannelUpgradeController.getOriginConnection(rest, chainId, event)
    const upgrade_connection_id = event.channelUpgradeInfo
      .upgradeConnectionHops as string
    const upgrade_connection = await ConnectionController.getConnection(
      rest,
      chainId,
      upgrade_connection_id
    )

    const channelUpgradeConfirm: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_CONFIRM,

      chain_id: origin_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: origin_connection.counterparty_connection_id,
      upgrade_connection_id: upgrade_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: origin_connection.connection_id,
      counterparty_upgrade_connection_id: upgrade_connection.connection_id,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_ACK,
          counterparty_chain_id: origin_connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
          upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
        },
      ]) // remove ACK from the src chain
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeConfirm) // store CONFIRM state to the dst chain
    }
  }

  static async feedUpgradeConfirmEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const origin_connection =
      await ChannelUpgradeController.getOriginConnection(rest, chainId, event)

    const channelUpgradeOpen: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_OPEN,

      chain_id: origin_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: origin_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: origin_connection.connection_id,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_CONFIRM,
          counterparty_chain_id: origin_connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
          upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
        },
      ]) // remove CONFIRM from the dst chain
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeOpen) // store OPEN state to the src chain
    }
  }

  // in this step, timeout cannot be happened because both channels are in FLUSHING_COMPLETE state
  // so don't need to set timeout height and timestamp.
  static async feedUpgradeOpenEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    // During the UPGRADE_OPEN step, the channel has already switched to using the new connection.
    // Getting the original connection requires accessing the counterparty channel's connection_hops
    // via the counterparty chain's REST client. This lookup is deferred to the relaying phase
    // in filterChannelUpgradeEvents() where we have access to both chain clients.
    //
    // const origin_connection =
    //   await ChannelUpgradeController.getOriginConnection(rest, chainId, event)
    const upgrade_connection_id = event.channelUpgradeInfo
      .upgradeConnectionHops as string
    const upgrade_connection = await ConnectionController.getConnection(
      rest,
      chainId,
      upgrade_connection_id
    )

    const channelUpgradeOpen: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_OPEN,

      chain_id: upgrade_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: 'placeholder', // Will be replaced with original connection ID by wallet worker
      upgrade_connection_id: upgrade_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: 'placeholder', // Will be replaced with original connection ID by wallet worker
      counterparty_upgrade_connection_id: upgrade_connection.connection_id,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      // remove any in progress upgrade from the both chains
      ChannelUpgradeController.cleanUpgrade(
        chainId,
        upgrade_connection.counterparty_chain_id,
        event,
        event.channelUpgradeInfo.upgradeSequence
      )

      // create OPEN state only if the counterparty channel is not open
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeOpen) // store OPEN state to the dst chain
    }
  }

  static async feedUpgradeErrorEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const origin_connection =
      await ChannelUpgradeController.getOriginConnection(rest, chainId, event)

    const channelUpgradeError: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_ERROR,

      chain_id: origin_connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: origin_connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: origin_connection.connection_id,

      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
      upgrade_error_receipt: event.channelUpgradeInfo.upgradeErrorReceipt,
    }

    return () => {
      // remove any in progress upgrade from the both chains
      ChannelUpgradeController.cleanUpgrade(
        chainId,
        origin_connection.counterparty_chain_id,
        event,
        event.channelUpgradeInfo.upgradeSequence
      )

      // create error state only if the counterparty channel is not open (in upgrade)
      insert(DB, ChannelUpgradeController.tableName, channelUpgradeError) // store ERROR state to the dst chain
    }
  }

  static cleanUpgrade(
    chainId: string,
    counterpartyChainId: string,
    event: ChannelUpgradeEvent,
    sequence: number
  ): void {
    del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
      {
        counterparty_chain_id: counterpartyChainId,
        counterparty_port_id: event.channelUpgradeInfo.dstPortId,
        counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
        upgrade_sequence: sequence
      },
      {
        counterparty_chain_id: chainId,
        counterparty_port_id: event.channelUpgradeInfo.srcPortId,
        counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
        upgrade_sequence: sequence,
      },
    ])
  }

  static updateInProgress(id?: number, inProgress = true): void {
    update<ChannelUpgradeTable>(
      DB,
      this.tableName,
      { in_progress: inProgress ? 1 : 0 },
      [{ id }]
    )
  }

  static deleteUpgrade(id: number): void {
    del<ChannelUpgradeTable>(DB, this.tableName, [{ id }])
  }

  // Get upgrade events that are not currently being processed
  static getChannelUpgradeEvents(
    chainId: string,
    counterpartyChainIds: string[],
    filter: PacketFilter = {},
    state?: ChannelState,
    limit = 100
  ): ChannelUpgradeTable[] {
    const wheres: WhereOptions<ChannelUpgradeTable>[] = []

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

    return select<ChannelUpgradeTable>(
      DB,
      ChannelUpgradeController.tableName,
      wheres,
      { id: 'ASC' },
      limit
    )
  }

  public static resetUpgradeInProgress(db?: Database) {
    db = db ?? DB
    update<ChannelUpgradeTable>(db, ChannelUpgradeController.tableName, {
      in_progress: Bool.FALSE,
    })
  }
}
