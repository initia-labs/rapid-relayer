import { Event } from '@cosmjs/tendermint-rpc/build/comet38/responses'
import {
  ChannelOpenCloseInfo,
  PacketFeeEvent,
  PacketInfo,
  UpdateClientEvent,
} from 'src/types'

export function parsePacketEvent(event: Event, height: number): PacketInfo {
  const connectionId = getConnection(event) as string

  const sequence = Number(find(event, 'packet_sequence') as string)

  const srcPort = find(event, 'packet_src_port') as string

  const srcChannel = find(event, 'packet_src_channel') as string

  const dstPort = find(event, 'packet_dst_port') as string

  const dstChannel = find(event, 'packet_dst_channel') as string

  const dataHex = find(event, 'packet_data_hex') as string

  const data = dataHex
    ? Buffer.from(dataHex, 'hex').toString('base64')
    : undefined

  const timeoutHeightRaw = find(event, 'packet_timeout_height') as string

  const timeoutHeight = Number(timeoutHeightRaw.split('-')[1])

  const timeoutTimestampRaw = find(event, 'packet_timeout_timestamp') as string
  const timeoutTimestamp = Number(BigInt(timeoutTimestampRaw) / 1_000_000_000n) // store in second

  const ackHex = find(event, 'packet_ack_hex')

  const ordering = find(event, 'packet_channel_ordering')

  const ack = ackHex ? Buffer.from(ackHex, 'hex').toString('base64') : undefined

  return {
    height,
    connectionId,
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp,
    timeoutHeightRaw,
    timeoutTimestampRaw,
    ordering,
    ack,
  }
}

export function parseChannelOpenEvent(
  event: Event,
  height: number
): ChannelOpenCloseInfo {
  const isSrc =
    event.type === 'channel_open_init' || event.type === 'channel_open_ack'

  const connectionId = getConnection(event) as string

  const portId = find(event, 'port_id') as string

  const channelId = find(event, 'channel_id') as string

  const counterpartyPortId = find(event, 'counterparty_port_id') as string

  const counterpartyChannelId = find(event, 'counterparty_channel_id') as string

  return {
    height,
    srcConnectionId: isSrc ? connectionId : '',
    srcPortId: isSrc ? portId : counterpartyPortId,
    srcChannelId: isSrc ? channelId : counterpartyChannelId,
    dstConnectionId: isSrc ? '' : connectionId,
    dstPortId: isSrc ? counterpartyPortId : portId,
    dstChannelId: isSrc ? counterpartyChannelId : channelId,
  }
}

export function parseChannelCloseEvent(
  event: Event,
  height: number
): ChannelOpenCloseInfo {
  const portId = find(event, 'port_id') as string
  const channelId = find(event, 'channel_id') as string
  const connectionId = getConnection(event) as string
  const counterpartyPortId = find(event, 'counterparty_port_id') as string
  const counterpartyChannelId = find(event, 'counterparty_channel_id') as string
  const isSrc = event.type === 'channel_close_init' || 'channel_close'

  return {
    height,
    srcConnectionId: isSrc ? connectionId : '',
    srcPortId: isSrc ? portId : counterpartyPortId,
    srcChannelId: isSrc ? channelId : counterpartyChannelId,
    dstConnectionId: isSrc ? '' : connectionId,
    dstPortId: isSrc ? counterpartyPortId : portId,
    dstChannelId: isSrc ? counterpartyChannelId : channelId,
  }
}

export function parsePacketFeeEvent(event: Event): PacketFeeEvent {
  const portId = find(event, 'port_id') as string

  const channelId = find(event, 'channel_id') as string

  const sequence = Number(find(event, 'packet_sequence') as string)

  const recvFee = find(event, 'recv_fee') as string

  const ackFee = find(event, 'ack_fee') as string

  const timeoutFee = find(event, 'timeout_fee') as string

  return {
    portId,
    channelId,
    sequence,
    recvFee,
    ackFee,
    timeoutFee,
  }
}

export function parseUpdateClientEvent(event: Event): UpdateClientEvent {
  const clientId = find(event, 'client_id') as string
  const header = find(event, 'header') as string
  let consensusHeights = find(event, 'consensus_heights') as string

  // to support old version of ibc-go
  if (consensusHeights === '') {
    consensusHeights = find(event, 'consensus_height') as string
  }

  return {
    clientId,
    header,
    consensusHeights,
  }
}

// recover_client or upgrade_client
export function parseReplaceClientEvent(event: Event): string {
  const clientId =
    find(event, 'subject_client_id') ?? (find(event, 'client_id') as string)

  return clientId
}

function getConnection(event: Event): string | undefined {
  return find(event, 'connection_id') || find(event, 'packet_connection')
}

function find(
  event: Event,
  key: string,
  defaultValue = ''
): string | undefined {
  // check key
  {
    const vals = event.attributes.filter((v) => v.key === key)
    if (vals.length !== 0) {
      return vals[0].value
    }
  }

  {
    // check base64 encoded key
    const base64Key = Buffer.from(key).toString('base64')
    const vals = event.attributes.filter((v) => v.key === base64Key)
    if (vals.length !== 0) {
      return Buffer.from(vals[0].value, 'base64').toString()
    }
  }

  return defaultValue
}
