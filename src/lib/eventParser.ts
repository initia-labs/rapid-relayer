import { Event } from '@cosmjs/tendermint-rpc/build/comet38/responses'
import { PacketInfo } from 'src/types'

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
