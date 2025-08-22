import { DB } from 'src/db'
import {
  ChannelUpgradeTable,
  ChannelState,
  Bool,
  ChannelUpgradeEvent,
} from 'src/types'
import { update, del, select, WhereOptions, In, insert } from '../utils'
import { PacketFilter } from './packet'
import { RESTClient } from 'src/lib/restClient'
import { ConnectionController } from './connection'
import {
  State,
  stateFromJSON,
} from '@initia/initia.proto/ibc/core/channel/v1/channel'
import { Database } from 'better-sqlite3'

export class ChannelUpgradeController {
  static tableName = 'channel_upgrade'

  static async feedEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    switch (event.type) {
      case 'channel_upgrade_init':
        return this.feedUpgradeInitEvent(rest, chainId, event)
      case 'channel_upgrade_try':
        return this.feedUpgradeTryEvent(rest, chainId, event)
      case 'channel_upgrade_ack':
        return this.feedUpgradeAckEvent(rest, chainId, event)
      case 'channel_upgrade_confirm':
        return this.feedUpgradeConfirmEvent(rest, chainId, event)
      case 'channel_upgrade_open':
        return this.feedUpgradeOpenEvent(rest, chainId, event)
      case 'channel_upgrade_error':
        return this.feedUpgradeErrorEvent(rest, chainId, event)
    }
  }

  static async feedUpgradeInitEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const channelUpgradeTry: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_TRY,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

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
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const upgrade = await rest.ibc.getUpgrade(
      event.channelUpgradeInfo.dstPortId,
      event.channelUpgradeInfo.dstChannelId
    )

    const channelUpgradeAck: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_ACK,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,

      upgrade_timeout_height: upgrade.timeout?.height.revision_height,
      upgrade_timeout_timestamp: upgrade.timeout?.timestamp,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_TRY,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
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
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const upgrade = await rest.ibc.getUpgrade(
      event.channelUpgradeInfo.dstPortId,
      event.channelUpgradeInfo.dstChannelId
    )

    const channelUpgradeConfirm: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_CONFIRM,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,

      upgrade_timeout_height: upgrade.timeout?.height.revision_height,
      upgrade_timeout_timestamp: upgrade.timeout?.timestamp,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_ACK,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
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
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const upgrade = await rest.ibc.getUpgrade(
      event.channelUpgradeInfo.dstPortId,
      event.channelUpgradeInfo.dstChannelId
    )

    const channelUpgradeOpen: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_OPEN,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,

      upgrade_timeout_height: upgrade.timeout?.height.revision_height,
      upgrade_timeout_timestamp: upgrade.timeout?.timestamp,
    }

    return () => {
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          state: ChannelState.UPGRADE_CONFIRM,
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
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
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const counterpartyChannel = await rest.ibc.channel(
      event.channelUpgradeInfo.dstPortId,
      event.channelUpgradeInfo.dstChannelId
    )

    const channelUpgradeOpen: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_OPEN,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

      upgrade_version: event.channelUpgradeInfo.upgradeVersion,
      upgrade_ordering: event.channelUpgradeInfo.upgradeOrdering,
      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
    }

    return () => {
      // remove any in progress upgrade from the both chains
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
        },
        {
          counterparty_chain_id: chainId,
          counterparty_port_id: event.channelUpgradeInfo.srcPortId,
          counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
        },
      ])

      // create OPEN state only if the counterparty channel is not open
      if (
        stateFromJSON(counterpartyChannel.channel.state) !== State.STATE_OPEN
      ) {
        insert(DB, ChannelUpgradeController.tableName, channelUpgradeOpen) // store OPEN state to the dst chain
      }
    }
  }

  static async feedUpgradeErrorEvent(
    rest: RESTClient,
    chainId: string,
    event: ChannelUpgradeEvent
  ): Promise<() => void> {
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.channelUpgradeInfo.upgradeConnectionHops as string
    )

    const counterpartyChannel = await rest.ibc.channel(
      event.channelUpgradeInfo.dstPortId,
      event.channelUpgradeInfo.dstChannelId
    )

    const channelUpgradeError: ChannelUpgradeTable = {
      in_progress: Bool.FALSE,
      state: ChannelState.UPGRADE_ERROR,

      chain_id: connection.counterparty_chain_id,
      port_id: event.channelUpgradeInfo.dstPortId,
      channel_id: event.channelUpgradeInfo.dstChannelId,
      connection_id: connection.counterparty_connection_id,

      counterparty_chain_id: chainId,
      counterparty_port_id: event.channelUpgradeInfo.srcPortId,
      counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
      counterparty_connection_id: event.channelUpgradeInfo
        .upgradeConnectionHops as string,

      upgrade_sequence: event.channelUpgradeInfo.upgradeSequence,
      upgrade_error_receipt: event.channelUpgradeInfo.upgradeErrorReceipt,
    }

    return () => {
      // remove any in progress upgrade from the both chains
      del<ChannelUpgradeTable>(DB, ChannelUpgradeController.tableName, [
        {
          counterparty_chain_id: connection.counterparty_chain_id,
          counterparty_port_id: event.channelUpgradeInfo.dstPortId,
          counterparty_channel_id: event.channelUpgradeInfo.dstChannelId,
        },
        {
          counterparty_chain_id: chainId,
          counterparty_port_id: event.channelUpgradeInfo.srcPortId,
          counterparty_channel_id: event.channelUpgradeInfo.srcChannelId,
        },
      ])

      // create error state only if the counterparty channel is not open (in upgrade)
      if (
        stateFromJSON(counterpartyChannel.channel.state) !== State.STATE_OPEN
      ) {
        insert(DB, ChannelUpgradeController.tableName, channelUpgradeError) // store ERROR state to the dst chain
      }
    }
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
