import * as fs from 'fs'
import { env } from 'node:process'
import { PacketFilter } from 'src/db/controller/packet'

export const config: Config = JSON.parse(
  fs.readFileSync(env.CONFIGFILE || './config.json').toString()
) as Config // TODO: get path of config

export interface Config {
  port: number
  metricPort: number
  logLevel: string
  dbPath?: string
  chains: ChainConfig[]
  raft?: RaftConfig
}

export interface RaftConfig {
  enabled: boolean
  nodeId: string
  host: string
  port: number
  peers: { id: string; host: string; port: number }[]
  electionTimeout?: number
  heartbeatInterval?: number
  psk?: string
}

interface ChainConfig {
  bech32Prefix: string
  chainId: string
  gasPrice: string
  restUri: string
  rpcUri: string
  wallets: WalletConfig[]
  feeFilter?: PacketFee
}

interface WalletConfig {
  key: KeyConfig
  maxHandlePacket?: number // max packet amount that handle at once
  packetFilter?: PacketFilter
  startHeight?: number
}

export interface PacketFee {
  recvFee?: Coin[]
  ackFee?: Coin[]
  timeoutFee?: Coin[]
}

interface Coin {
  denom: string
  amount: number
}

export interface KeyConfig {
  type: 'raw' | 'mnemonic' | 'env_raw' | 'env_mnemonic'
  privateKey: string
  /**
   * for mnemonic type keys only
   */
  options?: {
    account?: number
    /**
     * BIP44 index number
     */
    index?: number
    /**
     * Coin type. Default is INIT, 118.
     */
    coinType?: number
  }
}
