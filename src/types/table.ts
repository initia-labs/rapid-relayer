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
  in_progress: Boolean
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
  in_progress: Boolean
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
  in_progress: Boolean
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

export enum Boolean {
  TRUE = 1,
  FALSE = 0,
}
