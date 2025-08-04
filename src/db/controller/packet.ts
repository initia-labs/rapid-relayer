import {
  AcknowledgePacketEvent,
  PacketEvent,
  SendPacketEvent,
  TimeoutPacketEvent,
  WriteAckEvent,
  PacketSendTable,
  PacketTimeoutTable,
  PacketWriteAckTable,
  Bool,
  FeeType,
} from 'src/types'
import { DB } from '..'
import { In, WhereOptions, count, del, insert, select, update } from '../utils'
import { ConnectionController } from './connection'
import { Database } from 'better-sqlite3'
import { RESTClient } from 'src/lib/restClient'
import { PacketFeeController } from './packetFee'
import { PacketFee } from 'src/lib/config'
import * as Sentry from '@sentry/node'
import { ChannelController } from './channel'

export class PacketController {
  public static tableNamePacketSend = 'packet_send'
  public static tableNamePacketTimeout = 'packet_timeout'
  public static tableNamePacketWriteAck = 'packet_write_ack'

  public static async feedEvents(
    rest: RESTClient,
    chainId: string,
    events: PacketEvent[]
  ): Promise<() => void> {
    const feedFns: (() => void)[] = []
    for (const event of events) {
      switch (event.type) {
        case 'send_packet':
          feedFns.push(await this.feedSendPacketEvent(rest, chainId, event))
          break
        case 'write_acknowledgement':
          feedFns.push(await this.feedWriteAckEvent(rest, chainId, event))
          break
        case 'acknowledge_packet':
          feedFns.push(
            await this.feedAcknowledgePacketEvent(rest, chainId, event)
          )
          break
        case 'timeout_packet':
          feedFns.push(await this.feedTimeoutPacketEvent(rest, chainId, event))
          break
      }
    }

    return () => {
      for (const fn of feedFns) {
        fn()
      }
    }
  }

  public static getSendPackets(
    chainId: string,
    timestamp: number,
    chainIdsWithFeeFilters: ChainFilterInfo[],
    filter: PacketFilter = {},
    limit = 100
  ): PacketSendTable[] {
    const executeQuery = () => {
      const res: PacketSendTable[] = []
      // query for each chain id
      for (const {
        chainId: counterpartyChainId,
        feeFilter,
        latestHeight,
      } of chainIdsWithFeeFilters) {
        const wheres: WhereOptions<PacketSendTable>[] =
          PacketController.getSendPacketsWhere(
            chainId,
            Number(latestHeight),
            timestamp,
            counterpartyChainId,
            feeFilter,
            filter
          )

        res.push(
          ...select<PacketSendTable>(
            DB,
            PacketController.tableNamePacketSend,
            wheres,
            { sequence: 'ASC' },
            limit - res.length
          )
        )
      }

      return res
    }

    if (!process.env.SENTRY_DSN) {
      return executeQuery()
    }

    return Sentry.startSpan(
      {
        op: 'db.query',
        name: 'getSendPackets',
      },
      executeQuery
    )
  }

  public static getSendPacketsCount(
    chainId: string,
    timestamp: number,
    chainIdsWithFeeFilters: ChainFilterInfo[],
    filter: PacketFilter = {}
  ): number {
    let packetCount = 0
    // query for each chain id
    for (const {
      chainId: counterpartyChainId,
      feeFilter,
      latestHeight,
    } of chainIdsWithFeeFilters) {
      const wheres: WhereOptions<PacketSendTable>[] =
        PacketController.getSendPacketsWhere(
          chainId,
          latestHeight,
          timestamp,
          counterpartyChainId,
          feeFilter,
          filter
        )

      packetCount += count<PacketSendTable>(
        DB,
        PacketController.tableNamePacketSend,
        wheres
      )
    }

    return packetCount
  }

  private static getSendPacketsWhere(
    chainId: string,
    height: number,
    timestamp: number,
    counterpartyChainId: string,
    feeFilter: PacketFee,
    filter: PacketFilter = {}
  ): WhereOptions<PacketSendTable>[] {
    const wheres: WhereOptions<PacketSendTable>[] = []
    let custom = `((timeout_height = 0 OR timeout_height > ${height}) AND (timeout_timestamp = 0 OR timeout_timestamp > ${timestamp}))` // filter timeout packet
    if (feeFilter.recvFee && feeFilter.recvFee.length !== 0) {
      const conditions = feeFilter.recvFee.map(
        (v) =>
          `((SELECT amount FROM packet_fee WHERE chain_id = packet_send.src_chain_id AND channel_id = packet_send.src_channel_id AND sequence = packet_send.sequence AND fee_type = ${FeeType.RECV} AND denom = '${v.denom}') >= ${v.amount})`
      )
      custom += ` AND (${conditions.join(' OR ')})`
    }

    if (filter.connections) {
      // TODO: make this more efficientnet. filter connection by chain id
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: Bool.FALSE,
          dst_chain_id: chainId,
          dst_connection_id: conn.connectionId,
          dst_channel_id: conn.channels ? In(conn.channels) : undefined,
          src_chain_id: counterpartyChainId,
          custom,
        }))
      )
    } else {
      wheres.push({
        in_progress: Bool.FALSE,
        dst_chain_id: chainId,
        src_chain_id: counterpartyChainId,
        custom,
      })
    }

    return wheres
  }

  public static getTimeoutPackets(
    chainId: string,
    timestamp: number,
    chainIdsWithFeeFilters: ChainFilterInfo[],
    filter: PacketFilter = {},
    limit = 100
  ): PacketTimeoutTable[] {
    const res: PacketTimeoutTable[] = []

    for (const {
      chainId: counterpartyChainId,
      feeFilter,
      latestHeight,
    } of chainIdsWithFeeFilters) {
      const wheres = PacketController.getTimeoutPacketsWhere(
        chainId,
        timestamp,
        latestHeight,
        counterpartyChainId,
        feeFilter,
        filter
      )

      res.push(
        ...select<PacketTimeoutTable>(
          DB,
          PacketController.tableNamePacketTimeout,
          wheres,
          { sequence: 'ASC' },
          limit
        )
      )
    }

    return res
  }

  public static getTimeoutPacketsCount(
    chainId: string,
    timestamp: number,
    chainIdsWithFeeFilters: ChainFilterInfo[],
    filter: PacketFilter = {}
  ): number {
    let timeoutCount = 0

    for (const {
      chainId: counterpartyChainId,
      feeFilter,
      latestHeight,
    } of chainIdsWithFeeFilters) {
      const wheres = PacketController.getTimeoutPacketsWhere(
        chainId,
        timestamp,
        latestHeight,
        counterpartyChainId,
        feeFilter,
        filter
      )

      timeoutCount += count<PacketTimeoutTable>(
        DB,
        PacketController.tableNamePacketTimeout,
        wheres
      )
    }

    return timeoutCount
  }

  private static getTimeoutPacketsWhere(
    chainId: string,
    height: number,
    timestamp: number,
    counterpartyChainId: string,
    feeFilter: PacketFee,
    filter: PacketFilter = {}
  ): WhereOptions<PacketSendTable>[] {
    let custom = `((timeout_height < ${height} AND timeout_height != 0) OR (timeout_timestamp < ${timestamp} AND timeout_timestamp != 0))` // filter timeout packet

    if (feeFilter.timeoutFee && feeFilter.timeoutFee.length !== 0) {
      const conditions = feeFilter.timeoutFee.map(
        (v) =>
          `((SELECT amount FROM packet_fee WHERE chain_id = packet_timeout.src_chain_id AND channel_id = packet_timeout.src_channel_id AND sequence = packet_timeout.sequence AND fee_type = ${FeeType.TIMEOUT} AND denom = '${v.denom}') >= ${v.amount})`
      )
      custom += ` AND (${conditions.join(' OR ')})`
    }

    const wheres: WhereOptions<PacketSendTable>[] = []

    if (filter.connections) {
      // TODO: make this more efficientnet. filter connection by chain id
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: Bool.FALSE,
          src_chain_id: chainId,
          src_connection_id: conn.connectionId,
          src_channel_id: conn.channels ? In(conn.channels) : undefined,
          dst_chain_id: counterpartyChainId,
          custom,
        }))
      )
    } else {
      wheres.push({
        in_progress: Bool.FALSE,
        src_chain_id: chainId,
        dst_chain_id: counterpartyChainId,
        custom,
      })
    }

    return wheres
  }

  public static getWriteAckPackets(
    chainId: string,
    counterpartyChainIds: string[],
    feeFilter: PacketFee,
    filter: PacketFilter = {},
    limit = 100
  ): PacketWriteAckTable[] {
    const wheres = PacketController.getWriteAckPacketsWhere(
      chainId,
      counterpartyChainIds,
      feeFilter,
      filter
    )

    return select<PacketWriteAckTable>(
      DB,
      PacketController.tableNamePacketWriteAck,
      wheres,
      { sequence: 'ASC' },
      limit
    )
  }

  public static getWriteAckPacketsCount(
    chainId: string,
    counterpartyChainIds: string[],
    feeFilter: PacketFee,
    filter: PacketFilter = {}
  ): number {
    const wheres = PacketController.getWriteAckPacketsWhere(
      chainId,
      counterpartyChainIds,
      feeFilter,
      filter
    )

    return count<PacketWriteAckTable>(
      DB,
      PacketController.tableNamePacketWriteAck,
      wheres
    )
  }

  private static getWriteAckPacketsWhere(
    chainId: string,
    counterpartyChainIds: string[],
    feeFilter: PacketFee,
    filter: PacketFilter = {}
  ): WhereOptions<PacketWriteAckTable>[] {
    let custom = 'TRUE'

    if (feeFilter.ackFee && feeFilter.ackFee.length !== 0) {
      const conditions = feeFilter.ackFee.map(
        (v) =>
          `((SELECT amount FROM packet_fee WHERE chain_id = packet_write_ack.src_chain_id AND channel_id = packet_write_ack.src_channel_id AND sequence = packet_write_ack.sequence AND fee_type = ${FeeType.ACK} AND denom = '${v.denom}') >= ${v.amount})`
      )
      custom += ` AND (${conditions.join(' OR ')})`
    }

    const wheres: WhereOptions<PacketWriteAckTable>[] = []

    if (filter.connections) {
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: Bool.FALSE,
          src_chain_id: chainId,
          src_connection_id: conn.connectionId,
          src_channel_id: conn.channels ? In(conn.channels) : undefined,
          dst_chain_id: In(counterpartyChainIds), // TODO: make this more efficientnet, like filter it on outside of this.
          custom,
        }))
      )
    } else {
      wheres.push({
        in_progress: Bool.FALSE,
        src_chain_id: chainId,
        dst_chain_id: In(counterpartyChainIds),
        custom,
      })
    }

    return wheres
  }

  public static delSendPackets(packets: PacketSendTable[]) {
    if (packets.length === 0) return
    del<PacketSendTable>(
      DB,
      PacketController.tableNamePacketSend,
      packets.map((packet) => ({
        dst_chain_id: packet.dst_chain_id,
        dst_connection_id: packet.dst_connection_id,
        dst_channel_id: packet.dst_channel_id,
        sequence: packet.sequence,
      }))
    )
  }

  public static delTimeoutPackets(packets: PacketTimeoutTable[]) {
    if (packets.length === 0) return
    del<PacketTimeoutTable>(
      DB,
      PacketController.tableNamePacketTimeout,
      packets.map((packet) => ({
        src_chain_id: packet.src_chain_id,
        src_connection_id: packet.src_connection_id,
        src_channel_id: packet.src_channel_id,
        sequence: packet.sequence,
      }))
    )
  }

  public static delWriteAckPackets(packets: PacketWriteAckTable[]) {
    if (packets.length === 0) return
    del<PacketWriteAckTable>(
      DB,
      PacketController.tableNamePacketWriteAck,
      packets.map((packet) => ({
        src_chain_id: packet.src_chain_id,
        src_connection_id: packet.src_connection_id,
        src_channel_id: packet.src_channel_id,
        sequence: packet.sequence,
      }))
    )
  }

  public static updateSendPacketInProgress(
    packet: PacketSendTable,
    inProgress = true
  ) {
    update<PacketSendTable>(
      DB,
      PacketController.tableNamePacketSend,
      { in_progress: inProgress ? Bool.TRUE : Bool.FALSE },
      [
        {
          dst_chain_id: packet.dst_chain_id,
          dst_connection_id: packet.dst_connection_id,
          dst_channel_id: packet.dst_channel_id,
          sequence: packet.sequence,
        },
      ]
    )
  }

  public static updateTimeoutPacketInProgress(
    packet: PacketTimeoutTable,
    inProgress = true
  ) {
    update<PacketTimeoutTable>(
      DB,
      PacketController.tableNamePacketTimeout,
      { in_progress: inProgress ? Bool.TRUE : Bool.FALSE },
      [
        {
          src_chain_id: packet.src_chain_id,
          src_connection_id: packet.src_connection_id,
          src_channel_id: packet.src_channel_id,
          sequence: packet.sequence,
        },
      ]
    )
  }

  public static updateWriteAckPacketInProgress(
    packet: PacketWriteAckTable,
    inProgress = true
  ) {
    update<PacketWriteAckTable>(
      DB,
      PacketController.tableNamePacketWriteAck,
      { in_progress: inProgress ? Bool.TRUE : Bool.FALSE },
      [
        {
          src_chain_id: packet.src_chain_id,
          src_connection_id: packet.src_connection_id,
          src_channel_id: packet.src_channel_id,
          sequence: packet.sequence,
        },
      ]
    )
  }

  public static resetPacketInProgress(db?: Database) {
    db = db ?? DB
    update<PacketSendTable>(db, PacketController.tableNamePacketSend, {
      in_progress: Bool.FALSE,
    })
    update<PacketTimeoutTable>(db, PacketController.tableNamePacketTimeout, {
      in_progress: Bool.FALSE,
    })
    update<PacketWriteAckTable>(db, PacketController.tableNamePacketWriteAck, {
      in_progress: Bool.FALSE,
    })
  }

  private static async feedSendPacketEvent(
    rest: RESTClient,
    chainId: string,
    event: SendPacketEvent
  ): Promise<() => void> {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.packetInfo.connectionId
    )

    // add pakcet send on dst chain
    const packetSend: PacketSendTable = {
      dst_chain_id: connection.counterparty_chain_id,
      dst_connection_id: connection.counterparty_connection_id,
      dst_channel_id: event.packetInfo.dstChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: Bool.FALSE,
      is_ordered:
        'ORDER_ORDERED' === event.packetInfo.ordering ? Bool.TRUE : Bool.FALSE,
      height: event.packetInfo.height,
      dst_port: event.packetInfo.dstPort,
      src_chain_id: chainId,
      src_connection_id: event.packetInfo.connectionId,
      src_port: event.packetInfo.srcPort,
      src_channel_id: event.packetInfo.srcChannel,
      packet_data: event.packetInfo.data as string,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }

    // add packet timeout on source chain
    const packetTimeout: PacketTimeoutTable = {
      src_chain_id: chainId,
      src_connection_id: event.packetInfo.connectionId,
      src_channel_id: event.packetInfo.srcChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: Bool.FALSE,
      is_ordered:
        'ORDER_ORDERED' === event.packetInfo.ordering ? Bool.TRUE : Bool.FALSE,
      src_port: event.packetInfo.srcPort,
      dst_chain_id: connection.counterparty_chain_id,
      dst_connection_id: connection.counterparty_connection_id,
      dst_port: event.packetInfo.dstPort,
      dst_channel_id: event.packetInfo.dstChannel,
      packet_data: event.packetInfo.data as string,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }

    return () => {
      insert(DB, PacketController.tableNamePacketSend, packetSend)
      insert(DB, PacketController.tableNamePacketTimeout, packetTimeout)

      // if channel is ordered channel, update in progress for higher sequence
      if (packetSend.is_ordered === Bool.TRUE) {
        update<PacketSendTable>(
          DB,
          PacketController.tableNamePacketSend,
          { in_progress: Bool.FALSE },
          [
            {
              dst_chain_id: packetSend.dst_chain_id,
              dst_channel_id: packetSend.dst_channel_id,
            },
          ]
        )
      }
    }
  }

  private static async feedWriteAckEvent(
    rest: RESTClient,
    chainId: string,
    event: WriteAckEvent
  ): Promise<() => void> {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.packetInfo.connectionId
    )

    // add packet write ack on src chain
    const packetWriteAck: PacketWriteAckTable = {
      src_chain_id: connection.counterparty_chain_id,
      src_connection_id: connection.counterparty_connection_id,
      src_channel_id: event.packetInfo.srcChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: Bool.FALSE,
      is_ordered:
        'ORDER_ORDERED' === event.packetInfo.ordering ? Bool.TRUE : Bool.FALSE,
      height: event.packetInfo.height,
      src_port: event.packetInfo.srcPort,
      dst_chain_id: chainId,
      dst_connection_id: event.packetInfo.connectionId,
      dst_port: event.packetInfo.dstPort,
      dst_channel_id: event.packetInfo.dstChannel,
      packet_data: event.packetInfo.data as string,
      ack: event.packetInfo.ack as string,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }
    return () => {
      // remove pakcet send
      del<PacketSendTable>(DB, PacketController.tableNamePacketSend, [
        {
          dst_chain_id: chainId,
          dst_channel_id: event.packetInfo.dstChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet fees
      PacketFeeController.removePacketFee(
        packetWriteAck.src_chain_id,
        packetWriteAck.src_channel_id,
        packetWriteAck.sequence,
        FeeType.RECV
      )
      PacketFeeController.removePacketFee(
        packetWriteAck.src_chain_id,
        packetWriteAck.src_channel_id,
        packetWriteAck.sequence,
        FeeType.TIMEOUT
      )

      insert(DB, PacketController.tableNamePacketWriteAck, packetWriteAck)

      // if channel is ordered channel, update in progress for higher sequence
      if (packetWriteAck.is_ordered === Bool.TRUE) {
        update<PacketSendTable>(
          DB,
          PacketController.tableNamePacketSend,
          { in_progress: Bool.FALSE },
          [
            {
              dst_chain_id: chainId,
              dst_channel_id: event.packetInfo.dstChannel,
            },
          ]
        )
      }
    }
  }

  private static async feedAcknowledgePacketEvent(
    rest: RESTClient,
    chainId: string,
    event: AcknowledgePacketEvent
  ): Promise<() => void> {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.packetInfo.connectionId
    )

    return () => {
      // remove pakcet send
      del<PacketSendTable>(DB, PacketController.tableNamePacketSend, [
        {
          dst_chain_id: connection.counterparty_chain_id,
          dst_connection_id: connection.counterparty_connection_id,
          dst_channel_id: event.packetInfo.dstChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet timeout
      del<PacketTimeoutTable>(DB, PacketController.tableNamePacketSend, [
        {
          src_chain_id: chainId,
          src_connection_id: event.packetInfo.connectionId,
          src_channel_id: event.packetInfo.srcChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet write ack
      del<PacketWriteAckTable>(DB, PacketController.tableNamePacketSend, [
        {
          src_chain_id: chainId,
          src_connection_id: event.packetInfo.connectionId,
          src_channel_id: event.packetInfo.srcChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet fees
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.RECV
      )
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.TIMEOUT
      )
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.ACK
      )
    }
  }

  private static async feedTimeoutPacketEvent(
    rest: RESTClient,
    chainId: string,
    event: TimeoutPacketEvent
  ): Promise<() => void> {
    // old version of ibc-go does not have connection_id in event
    if (event.packetInfo.connectionId === '') {
      event.packetInfo.connectionId =
        await ChannelController.getChannelConnection(
          rest,
          chainId,
          event.packetInfo.srcPort,
          event.packetInfo.srcChannel
        ).then((channelConnection) => channelConnection.connection_id)
    }

    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      rest,
      chainId,
      event.packetInfo.connectionId
    )
    return () => {
      // remove pakcet send
      del<PacketSendTable>(DB, PacketController.tableNamePacketSend, [
        {
          dst_chain_id: connection.counterparty_chain_id,
          dst_connection_id: connection.counterparty_connection_id,
          dst_channel_id: event.packetInfo.dstChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet timeout
      del<PacketTimeoutTable>(DB, PacketController.tableNamePacketSend, [
        {
          src_chain_id: chainId,
          src_connection_id: event.packetInfo.connectionId,
          src_channel_id: event.packetInfo.srcChannel,
          sequence: Number(event.packetInfo.sequence),
        },
      ])

      // remove packet fees
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.RECV
      )
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.TIMEOUT
      )
      PacketFeeController.removePacketFee(
        chainId,
        event.packetInfo.srcChannel,
        event.packetInfo.sequence,
        FeeType.ACK
      )
    }
  }

  // update timeout timestamp to -1 to execute timeout closed channel
  public static updateTimeout(chainId: string, channelId: string) {
    update<PacketTimeoutTable>(
      DB,
      PacketController.tableNamePacketTimeout,
      { timeout_timestamp: -1 },
      [
        {
          dst_channel_id: channelId,
          dst_chain_id: chainId,
        },
      ]
    )
  }
}

export interface PacketFilter {
  connections?: {
    connectionId: string
    channels?: string[] // if empty search all
  }[] // if empty search all
}

export interface ChainFilterInfo {
  chainId: string
  feeFilter: PacketFee
  latestHeight: number
}
