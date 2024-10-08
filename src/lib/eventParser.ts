import { Event } from '@cosmjs/tendermint-rpc/build/comet38/responses'
import { ChannelOpenInfo, PacketFeeEvent, PacketInfo } from 'src/types'

export function parsePacketEvent(event: Event, height: number): PacketInfo {
  const connectionId = event.attributes.filter(
    (v) => v.key === 'connection_id'
  )[0].value

  const sequence = Number(
    event.attributes.filter((v) => v.key === 'packet_sequence')[0].value
  )

  const srcPort = event.attributes.filter((v) => v.key === 'packet_src_port')[0]
    .value

  const srcChannel = event.attributes.filter(
    (v) => v.key === 'packet_src_channel'
  )[0].value

  const dstPort = event.attributes.filter((v) => v.key === 'packet_dst_port')[0]
    .value

  const dstChannel = event.attributes.filter(
    (v) => v.key === 'packet_dst_channel'
  )[0].value

  const dataHex = event.attributes.filter((v) => v.key === 'packet_data_hex')

  const data =
    dataHex.length === 0
      ? undefined
      : Buffer.from(dataHex[0].value, 'hex').toString('base64')

  const timeoutHeightRaw = event.attributes.filter(
    (v) => v.key === 'packet_timeout_height'
  )[0].value

  const timeoutHeight = Number(timeoutHeightRaw.split('-')[1])

  const timeoutTimestampRaw = event.attributes.filter(
    (v) => v.key === 'packet_timeout_timestamp'
  )[0].value
  const timeoutTimestamp = Number(BigInt(timeoutTimestampRaw) / 1_000_000_000n) // store in second

  const ackHex = event.attributes.filter((v) => v.key === 'packet_ack_hex')

  const ack =
    ackHex.length === 0
      ? undefined
      : Buffer.from(ackHex[0].value, 'hex').toString('base64')

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
    ack,
  }
}

export function parseChannelOpenEvent(
  event: Event,
  height: number
): ChannelOpenInfo {
  const isSrc =
    event.type === 'channel_open_init' || event.type === 'channel_open_ack'

  const connectionId = find(event, 'connection_id')

  const portId = find(event, 'port_id')

  const channelId = find(event, 'channel_id')

  const counterpartyPortId = find(event, 'counterparty_port_id')

  const counterpartyChannelId = find(event, 'counterparty_channel_id')

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
  const portId = find(event, 'port_id')

  const channelId = find(event, 'channel_id')

  const sequence = Number(find(event, 'packet_sequence'))

  const recvFee = find(event, 'recv_fee')

  const ackFee = find(event, 'ack_fee')

  const timeoutFee = find(event, 'timeout_fee')

  return {
    portId,
    channelId,
    sequence,
    recvFee,
    ackFee,
    timeoutFee,
  }
}

function find(event: Event, key: string, defaultValue = ''): string {
  const filtered = event.attributes.filter((v) => v.key === key)

  if (filtered.length === 0) {
    return defaultValue
  }

  return filtered[0].value
}
