export type PacketEvent =
  | AcknowledgePacketEvent
  | SendPacketEvent
  | TimeoutPacketEvent
  | WriteAckEvent

export type PacketType = PacketEvent['type']

export interface AcknowledgePacketEvent {
  type: 'acknowledge_packet'
  packetInfo: PacketInfo
}

export interface SendPacketEvent {
  type: 'send_packet'
  packetInfo: PacketInfo
}

export interface TimeoutPacketEvent {
  type: 'timeout_packet'
  packetInfo: PacketInfo
}

export interface WriteAckEvent {
  type: 'write_acknowledgement'
  packetInfo: PacketInfo
}

export interface PacketInfo {
  height: number
  connectionId: string
  sequence: number
  srcPort: string
  srcChannel: string
  dstPort: string
  dstChannel: string
  data?: string
  timeoutHeight: number
  timeoutTimestamp: number
  timeoutHeightRaw: string
  timeoutTimestampRaw: string
  ack?: string
}

export interface UpdateClientEvent {
  clientId: string
  header: string
  consensusHeights: string
}
