import {
  AcknowledgePacketEvent,
  PacketEvent,
  SendPacketEvent,
  TimeoutPacketEvent,
  WriteAckEvent,
  PacketSendTable,
  PacketTimeoutTable,
  PacketWriteAckTable,
} from 'src/types'
import { DB } from '..'
import { In, WhereOptions, del, insert, select, update } from '../utils'
import { LCDClient } from '@initia/initia.js'
import { ConnectionController } from './connection'

export class PacketController {
  private static tableNamePacketSend = 'packet_send'
  private static tableNamePacketTimeout = 'packet_timeout'
  private static tableNamePacketWriteAck = 'packet_write_ack'

  public static async feedEvents(
    lcd: LCDClient,
    chainId: string,
    events: PacketEvent[]
  ) {
    for (const event of events) {
      switch (event.type) {
        case 'send_packet':
          await this.feedSendPacketEvent(lcd, chainId, event)
          break
        case 'write_acknowledgement':
          await this.feedWriteAckEvent(lcd, chainId, event)
          break
        case 'acknowledge_packet':
          await this.feedAcknowledgePacketEvent(lcd, chainId, event)
          break
        case 'timeout_packet':
          await this.feedTimeoutPacketEvent(lcd, chainId, event)
          break
      }
    }
  }

  public static getSendPackets(
    chainId: string,
    counterpartyChainIds: string[],
    filter: PacketFilter = {},
    limit = 100
  ): PacketSendTable[] {
    const wheres: WhereOptions<PacketSendTable>[] = []
    if (filter.connections) {
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: false,
          dst_chain_id: chainId,
          dst_connection_id: conn.connectionId,
          dst_channel_id: conn.channels ? In(conn.channels) : undefined,
          src_chain_id: In(counterpartyChainIds), // TODO: make this more efficientnet, like filter it on outside of this.
        }))
      )
    } else {
      wheres.push({
        in_progress: false,
        dst_chain_id: chainId,
        src_chain_id: In(counterpartyChainIds),
      })
    }

    return select<PacketSendTable>(DB, this.tableNamePacketSend, wheres, limit)
  }

  public static getTimeoutPackets(
    chainId: string,
    height: number,
    timetstamp: number,
    counterpartyChainIds: string[],
    filter: PacketFilter = {},
    limit = 100
  ): PacketTimeoutTable[] {
    const wheres: WhereOptions<PacketTimeoutTable>[] = []

    if (filter.connections) {
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: false,
          src_chain_id: chainId,
          src_connection_id: conn.connectionId,
          src_channel_id: conn.channels ? In(conn.channels) : undefined,
          dst_chain_id: In(counterpartyChainIds), // TODO: make this more efficientnet, like filter it on outside of this.
          height: { lt: height, gt: 0 },
          timetstamp: { lt: timetstamp, gt: 0 },
        }))
      )
    } else {
      wheres.push({
        in_progress: false,
        src_chain_id: chainId,
        dst_chain_id: In(counterpartyChainIds),
      })
    }

    return select<PacketTimeoutTable>(
      DB,
      this.tableNamePacketTimeout,
      wheres,
      limit
    )
  }

  public static getWriteAckPackets(
    chainId: string,
    counterpartyChainIds: string[],
    filter: PacketFilter = {},
    limit = 100
  ): PacketWriteAckTable[] {
    const wheres: WhereOptions<PacketWriteAckTable>[] = []

    if (filter.connections) {
      wheres.push(
        ...filter.connections.map((conn) => ({
          in_progress: false,
          src_chain_id: chainId,
          src_connection_id: conn.connectionId,
          src_channel_id: conn.channels ? In(conn.channels) : undefined,
          dst_chain_id: In(counterpartyChainIds), // TODO: make this more efficientnet, like filter it on outside of this.
        }))
      )
    } else {
      wheres.push({
        in_progress: false,
        src_chain_id: chainId,
        dst_chain_id: In(counterpartyChainIds),
      })
    }

    return select<PacketWriteAckTable>(
      DB,
      this.tableNamePacketWriteAck,
      wheres,
      limit
    )
  }

  public static updateSendPacketInProgress(
    packet: PacketSendTable,
    inProgress = true
  ) {
    update<PacketSendTable>(
      DB,
      this.tableNamePacketSend,
      { in_progress: inProgress },
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
      this.tableNamePacketTimeout,
      { in_progress: inProgress },
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
      this.tableNamePacketWriteAck,
      { in_progress: inProgress },
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

  private static async feedSendPacketEvent(
    lcd: LCDClient,
    chainId: string,
    event: SendPacketEvent
  ) {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.packetInfo.connectionId
    )

    // add pakcet send on dst chain
    const packetSend: PacketSendTable = {
      dst_chain_id: connection.counterparty_chain_id,
      dst_connection_id: connection.counterparty_connection_id,
      dst_channel_id: event.packetInfo.dstChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: false,
      dst_port: event.packetInfo.dstPort,
      src_chain_id: chainId,
      src_connection_id: event.packetInfo.connectionId,
      src_port: event.packetInfo.srcPort,
      src_channel_id: event.packetInfo.srcChannel,
      packet_data: event.packetInfo.data,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }

    insert(DB, this.tableNamePacketSend, packetSend)

    // add packet timeout on source chain
    const packetTimeout: PacketTimeoutTable = {
      src_chain_id: chainId,
      src_connection_id: event.packetInfo.connectionId,
      src_channel_id: event.packetInfo.srcChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: false,
      src_port: event.packetInfo.srcPort,
      dst_chain_id: connection.counterparty_chain_id,
      dst_connection_id: connection.counterparty_connection_id,
      dst_port: event.packetInfo.dstPort,
      dst_channel_id: event.packetInfo.dstChannel,
      packet_data: event.packetInfo.data,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }

    insert(DB, this.tableNamePacketTimeout, packetTimeout)
  }

  private static async feedWriteAckEvent(
    lcd: LCDClient,
    chainId: string,
    event: WriteAckEvent
  ) {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.packetInfo.connectionId
    )

    // remove pakcet send
    del<PacketSendTable>(DB, this.tableNamePacketSend, [
      {
        dst_chain_id: chainId,
        dst_connection_id: event.packetInfo.connectionId,
        dst_channel_id: event.packetInfo.dstChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])

    // add packet write ack on src chain
    const packetWriteAck: PacketWriteAckTable = {
      src_chain_id: connection.counterparty_chain_id,
      src_connection_id: connection.counterparty_connection_id,
      src_channel_id: event.packetInfo.srcChannel,
      sequence: Number(event.packetInfo.sequence),
      in_progress: false,
      src_port: event.packetInfo.srcPort,
      dst_chain_id: chainId,
      dst_connection_id: event.packetInfo.connectionId,
      dst_port: event.packetInfo.dstPort,
      dst_channel_id: event.packetInfo.dstChannel,
      packet_data: event.packetInfo.data,
      ack: event.packetInfo.ack as string,
      timeout_height: Number(event.packetInfo.timeoutHeight),
      timeout_timestamp: Number(event.packetInfo.timeoutTimestamp),
      timeout_height_raw: event.packetInfo.timeoutHeightRaw,
      timeout_timestamp_raw: event.packetInfo.timeoutTimestampRaw,
    }

    insert(DB, this.tableNamePacketWriteAck, packetWriteAck)
  }

  private static async feedAcknowledgePacketEvent(
    lcd: LCDClient,
    chainId: string,
    event: AcknowledgePacketEvent
  ) {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.packetInfo.connectionId
    )

    // remove pakcet send
    del<PacketSendTable>(DB, this.tableNamePacketSend, [
      {
        dst_chain_id: connection.counterparty_chain_id,
        dst_connection_id: connection.counterparty_connection_id,
        dst_channel_id: event.packetInfo.dstChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])

    // remove packet timeout
    del<PacketTimeoutTable>(DB, this.tableNamePacketSend, [
      {
        src_chain_id: chainId,
        src_connection_id: event.packetInfo.connectionId,
        src_channel_id: event.packetInfo.srcChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])

    // remove packet write ack
    del<PacketWriteAckTable>(DB, this.tableNamePacketSend, [
      {
        src_chain_id: chainId,
        src_connection_id: event.packetInfo.connectionId,
        src_channel_id: event.packetInfo.srcChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])
  }

  private static async feedTimeoutPacketEvent(
    lcd: LCDClient,
    chainId: string,
    event: TimeoutPacketEvent
  ) {
    // get counterparty's info
    const connection = await ConnectionController.getConnection(
      lcd,
      chainId,
      event.packetInfo.connectionId
    )

    // remove pakcet send
    del<PacketSendTable>(DB, this.tableNamePacketSend, [
      {
        dst_chain_id: connection.counterparty_chain_id,
        dst_connection_id: connection.counterparty_connection_id,
        dst_channel_id: event.packetInfo.dstChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])

    // remove packet timeout
    del<PacketTimeoutTable>(DB, this.tableNamePacketSend, [
      {
        src_chain_id: chainId,
        src_connection_id: event.packetInfo.connectionId,
        src_channel_id: event.packetInfo.srcChannel,
        sequence: Number(event.packetInfo.sequence),
      },
    ])
  }
}

export interface PacketFilter {
  connections?: {
    connectionId: string
    channels?: string[] // if empty search all
  }[] // if empty search all
}
