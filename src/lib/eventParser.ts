import { Height, Packet } from '@initia/initia.js'
import { Event } from '@cosmjs/tendermint-rpc/build/comet38/responses'
import { Ack } from 'src/msgs'

export function parseSendPacketEvent(
  event: Event,
  connectionId: string
): Packet | undefined {
  if (event.type !== 'send_packet') return

  // connection filter
  if (getValue(event, 'connection_id') !== connectionId) {
    return
  }

  const sequence = Number(getValue(event, 'packet_sequence') as string)

  const srcPort = getValue(event, 'packet_src_port') as string

  const srcChannel = getValue(event, 'packet_src_channel') as string

  const dstPort = getValue(event, 'packet_dst_port') as string

  const dstChannel = getValue(event, 'packet_dst_channel') as string

  const data = Buffer.from(
    getValue(event, 'packet_data_hex') as string,
    'hex'
  ).toString('base64')

  const timeoutHeightRaw = getValue(event, 'packet_timeout_height') as string

  const timeoutHeight = new Height(
    Number(timeoutHeightRaw.split('-')[0]),
    Number(timeoutHeightRaw.split('-')[1])
  )

  const timeoutTimestamp = getValue(event, 'packet_timeout_timestamp') as string

  return new Packet(
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp
  )
}

export function parseWriteAckEvent(
  event: Event,
  connectionId: string
): Ack | undefined {
  if (event.type !== 'write_acknowledgement') return
  // connection filter
  if (getValue(event, 'connection_id') !== connectionId) {
    return
  }

  const sequence = Number(getValue(event, 'packet_sequence') as string)

  const srcPort = getValue(event, 'packet_src_port') as string

  const srcChannel = getValue(event, 'packet_src_channel') as string

  const dstPort = getValue(event, 'packet_dst_port') as string

  const dstChannel = getValue(event, 'packet_dst_channel') as string

  const data = Buffer.from(
    getValue(event, 'packet_data_hex') as string,
    'hex'
  ).toString('base64')

  const timeoutHeightRaw = getValue(event, 'packet_timeout_height') as string

  const timeoutHeight = new Height(
    Number(timeoutHeightRaw.split('-')[0]),
    Number(timeoutHeightRaw.split('-')[1])
  )

  const timeoutTimestamp = getValue(event, 'packet_timeout_timestamp') as string

  const packet = new Packet(
    sequence,
    srcPort,
    srcChannel,
    dstPort,
    dstChannel,
    data,
    timeoutHeight,
    timeoutTimestamp
  )

  const acknowledgement = Buffer.from(
    event.attributes.filter((v) => v.key === 'packet_ack_hex')[0].value,
    'hex'
  ).toString('base64')

  return {
    packet,
    acknowledgement,
  }
}

function getValue(event: Event, key: string): string | undefined {
  // check key
  {
    const vals = event.attributes.filter((v) => v.key === key)
    if (vals.length !== 0) {
      return vals[0].value
    }
  }

  {
    // check base64 encoded key
    const vals = event.attributes.filter(
      (v) => v.key === Buffer.from(`${key}`).toString('base64')
    )
    if (vals.length !== 0) {
      return Buffer.from(vals[0].value, 'base64').toString()
    }
  }

  return undefined
}
