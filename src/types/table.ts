export interface VersionTable {
  id: number
  version: string
}

export interface SyncInfoTable {
  chain_id: string
  start_height: number
  end_height: number
  synced_height: number
}

export interface ClientTable {
  chain_id: string
  client_id: string
  counterparty_chain_id: string
  trusting_period: number
  revision_height: number
  last_update_time: number
}

export interface ConnectionTable {
  chain_id: string
  connection_id: string
  client_id: string
  counterparty_chain_id: string
  counterparty_connection_id: string
  counterparty_client_id: string
}

export interface PacketSendTable {
  dst_chain_id: string
  dst_connection_id: string
  dst_channel_id: string
  sequence: number
  in_progress: Bool
  is_ordered: Bool
  height: number
  dst_port: string
  src_chain_id: string
  src_connection_id: string
  src_port: string
  src_channel_id: string
  packet_data: string
  timeout_height: number
  timeout_timestamp: number
  timeout_height_raw: string
  timeout_timestamp_raw: string
}

export interface PacketTimeoutTable {
  src_chain_id: string
  src_connection_id: string
  src_channel_id: string
  sequence: number
  in_progress: Bool
  is_ordered: Bool
  src_port: string
  dst_chain_id: string
  dst_connection_id: string
  dst_port: string
  dst_channel_id: string
  packet_data: string
  timeout_height: number
  timeout_timestamp: number
  timeout_height_raw: string
  timeout_timestamp_raw: string
}

export interface PacketWriteAckTable {
  src_chain_id: string
  src_connection_id: string
  src_channel_id: string
  sequence: number
  in_progress: Bool
  is_ordered: Bool
  height: number
  src_port: string
  dst_chain_id: string
  dst_connection_id: string
  dst_port: string
  dst_channel_id: string
  packet_data: string
  ack: string
  timeout_height: number
  timeout_timestamp: number
  timeout_height_raw: string
  timeout_timestamp_raw: string
}

export interface ChannelOpenCloseTable {
  id?: number
  in_progress: Bool
  height: number
  state: ChannelState
  chain_id: string
  connection_id: string
  port_id: string
  channel_id: string
  counterparty_chain_id: string
  counterparty_connection_id: string
  counterparty_port_id: string
  counterparty_channel_id: string
}

export interface ChannelUpgradeTable {
  id?: number
  in_progress: Bool
  state: ChannelState

  chain_id: string
  port_id: string
  channel_id: string
  connection_id: string
  upgrade_connection_id?: string

  counterparty_chain_id: string
  counterparty_port_id: string
  counterparty_channel_id: string
  counterparty_connection_id: string
  counterparty_upgrade_connection_id?: string

  upgrade_sequence?: number
  upgrade_version?: string
  upgrade_ordering?: string
  upgrade_error_receipt?: string  
}

export interface PacketFeeTable {
  chain_id: string
  channel_id: string
  sequence: number
  fee_type: FeeType
  denom: string
  amount: number
}

export interface ChannelConnectionTable {
  chain_id: string
  channel_id: string
  connection_id: string
}

export enum Bool {
  TRUE = 1,
  FALSE = 0,
}

export enum ChannelState {
  INIT = 1,
  TRYOPEN = 2,
  ACK = 3,
  CLOSE = 4,
  UPGRADE_TRY = 5,
  UPGRADE_ACK = 6,
  UPGRADE_CONFIRM = 7,
  UPGRADE_OPEN = 8,
  UPGRADE_ERROR = 9,
  UPGRADE_TIMEOUT = 10,
}

export enum FeeType {
  RECV = 1,
  ACK = 2,
  TIMEOUT = 3,
}
