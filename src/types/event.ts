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
  ordering?: string // some version doesn't have ordering in write ack event
  ack?: string
}

export interface UpdateClientEvent {
  clientId: string
  header: string
  consensusHeights: string
}

export interface ChannelOpenCloseEvent {
  type:
    | 'channel_open_init'
    | 'channel_open_try'
    | 'channel_open_ack'
    | 'channel_open_confirm'
    | 'channel_close_init'
    | 'channel_close'
    | 'channel_close_confirm'
  channelOpenCloseInfo: ChannelOpenCloseInfo
}

export interface ChannelOpenCloseInfo {
  height: number
  srcConnectionId: string
  srcPortId: string
  srcChannelId: string
  dstConnectionId: string
  dstPortId: string
  dstChannelId: string
}

export interface ChannelUpgradeEvent {
  type:
    | 'channel_upgrade_init'
    | 'channel_upgrade_try'
    | 'channel_upgrade_ack'
    | 'channel_upgrade_confirm'
    | 'channel_upgrade_open'
    | 'channel_upgrade_error'
    // | 'channel_upgrade_timeout'
    // | 'channel_upgrade_cancelled'
    // | 'channel_flush_complete'
  channelUpgradeInfo: ChannelUpgradeInfo
}

export interface ChannelUpgradeInfo {
  height: number
  srcPortId: string
  srcChannelId: string
  dstPortId: string
  dstChannelId: string
  upgradeSequence: number
  upgradeVersion?: string
  upgradeOrdering?: string
  upgradeConnectionHops?: string
  upgradeErrorReceipt?: string
  channelState?: string
}

export interface PacketFeeEvent {
  portId: string
  channelId: string
  sequence: number
  recvFee: string
  ackFee: string
  timeoutFee: string
}
