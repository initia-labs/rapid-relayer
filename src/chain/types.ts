import { Key, Packet } from '@initia/initia.js'
import { Ack } from 'src/msgs'

export interface ChainConfig {
  bech32Prefix: string
  chainId: string
  gasPrice: string
  lcdUri: string
  rpcUri: string
  key: Key
  connectionId: string
  syncInfo?: {
    height: number
    txIndex: number
  }
}

export interface SyncInfo {
  height: number
  txIndex: number
}

export type PacketEventWithIndex =
  | SendPacketEventWithIndex
  | WriteAckEventWithIndex

export interface SendPacketEventWithIndex {
  height: number
  txIndex: number
  type: 'send_packet'
  packetData: Packet
}

export interface WriteAckEventWithIndex {
  height: number
  txIndex: number
  type: 'write_acknowledgement'
  packetData: Ack
}

export interface ChainStatus {
  chainId: string
  connectionId: string
  latestHeightInfo: {
    height: number
    timestamp: Date
  }
  lastFeedHeight: number
  syncInfo: SyncInfo
}

export interface ClientState {
  client_state: {
    trusting_period: string
    latest_height: {
      revision_height: string
    }
  }
}

export interface ChannelState {
  channel: {
    state: string
    ordering: string
    counterparty: {
      port_id: string
      channel_id: string
    }
    connection_hops: string[]
    version: string
    upgrade_sequence: string
  }
  proof: null
  proof_height: {
    revision_number: string
    revision_height: string
  }
}
