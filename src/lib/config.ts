import * as fs from 'fs'
import { env } from 'node:process'
import { PacketFilter } from 'src/db/controller/packet'

// load configuration from the json file
export const loadJsonConfig = (): Partial<Config> => {
  try {
    // check if a config file exists before trying to read it
    const configPath = env.CONFIGFILE || './config.json'
    if (!fs.existsSync(configPath)) {
      return {}
    }

    const configContent = fs.readFileSync(configPath).toString()
    if (!configContent || configContent.trim() === '{}') {
      return {}
    }

    return JSON.parse(configContent) as Config
  } catch (err) {
    throw new Error(`Error loading JSON config: ${err}`)
  }
}

// json parsing helper
export const safeJsonParse = <T>(json: string, defaultValue: T): T => {
  try {
    return JSON.parse(json) as T
  } catch {
    return defaultValue
  }
}

// load configuration from environment variables
export const loadEnvConfig = (): Partial<Config> => {
  const envConfig: Partial<Config> = {}

  // top-level properties
  if (env.PORT) envConfig.port = Number(env.PORT)
  if (env.METRIC_PORT) envConfig.metricPort = Number(env.METRIC_PORT)
  if (env.LOG_LEVEL) envConfig.logLevel = env.LOG_LEVEL
  if (env.RPC_REQUEST_TIMEOUT)
    envConfig.rpcRequestTimeout = Number(env.RPC_REQUEST_TIMEOUT)
  if (env.DB_PATH) envConfig.dbPath = env.DB_PATH

  // chains configuration
  if (env.CHAINS) {
    try {
      const parsedChains = safeJsonParse<ChainConfig[]>(env.CHAINS, [])
      if (Array.isArray(parsedChains) && parsedChains.length > 0) {
        envConfig.chains = parsedChains
      }
    } catch (err) {
      throw new Error(`Error parsing CHAINS environment variable: ${err}`)
    }
  } else {
    // try to load individual chain configurations
    const chains: ChainConfig[] = []

    // find all chain ids from environment variables
    const chainIdPattern = /^CHAIN_(\d+)_CHAIN_ID$/
    const chainIds = Object.keys(env)
      .filter((key) => chainIdPattern.test(key))
      .map((key) => {
        const match = key.match(chainIdPattern)
        return match ? match[1] : null
      })
      .filter((id): id is string => id !== null)

    // for each found chain id, load its configuration
    for (const index of chainIds) {
      const chain: Partial<ChainConfig> = {}

      if (env[`CHAIN_${index}_CHAIN_ID`])
        chain.chainId = env[`CHAIN_${index}_CHAIN_ID`]
      if (env[`CHAIN_${index}_BECH32_PREFIX`])
        chain.bech32Prefix = env[`CHAIN_${index}_BECH32_PREFIX`]
      if (env[`CHAIN_${index}_GAS_PRICE`])
        chain.gasPrice = env[`CHAIN_${index}_GAS_PRICE`]
      if (env[`CHAIN_${index}_REST_URI`])
        chain.restUri = env[`CHAIN_${index}_REST_URI`]

      const rawRpcUri = env[`CHAIN_${index}_RPC_URI`]?.trim()
      if (rawRpcUri) {
        if (rawRpcUri.startsWith('[') && rawRpcUri.endsWith(']')) {
          chain.rpcUri = safeJsonParse<string[]>(rawRpcUri, [rawRpcUri])
        } else {
          chain.rpcUri = rawRpcUri
        }
      }

      // fee filter
      if (env[`CHAIN_${index}_FEE_FILTER`]) {
        try {
          const feeFilterStr = env[`CHAIN_${index}_FEE_FILTER`] || '{}'
          chain.feeFilter = safeJsonParse<PacketFee>(feeFilterStr, {})
        } catch (err) {
          throw new Error(`Error parsing CHAIN_${index}_FEE_FILTER environment variable: ${err}`)
        }
      }

      // wallets
      if (env[`CHAIN_${index}_WALLETS`]) {
        try {
          const walletsStr = env[`CHAIN_${index}_WALLETS`] || '[]'
          const parsedWallets = safeJsonParse<WalletConfig[]>(walletsStr, [])
          if (Array.isArray(parsedWallets) && parsedWallets.length > 0) {
            chain.wallets = parsedWallets
          }
        } catch (err) {
          throw new Error(`Error parsing CHAIN_${index}_WALLETS environment variable: ${err}`)
        }
      } else {
        // try to load individual wallet configurations
        const wallets: WalletConfig[] = []

        // find all wallet ids for this chain
        const walletPattern = new RegExp(
          `^CHAIN_${index}_WALLET_(\\d+)_KEY_TYPE$`
        )
        const walletIds = Object.keys(env)
          .filter((key) => walletPattern.test(key))
          .map((key) => {
            const match = key.match(walletPattern)
            return match ? match[1] : null
          })
          .filter((id): id is string => id !== null)

        // for each wallet id, load its configuration
        for (const walletIndex of walletIds) {
          const wallet: Partial<WalletConfig> = {}

          // key configuration
          const key: Partial<KeyConfig> = {}
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_TYPE`]) {
            const keyType = env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_TYPE`]
            if (
              keyType === 'raw' ||
              keyType === 'mnemonic' ||
              keyType === 'env_raw' ||
              keyType === 'env_mnemonic'
            ) {
              key.type = keyType
            } else {
              throw new Error(`Error invalid key type for chain index ${index}: wallet ${walletIndex}`)
            }
          }
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_PRIVATE_KEY`]) {
            key.privateKey =
              env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_PRIVATE_KEY`]
          }

          // key options
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS`]) {
            try {
              const optionsStr =
                env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS`] || '{}'
              key.options = safeJsonParse<KeyConfig['options']>(optionsStr, {})
            } catch (err) {
              throw new Error(`Error parsing CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS environment variable: ${err}`)
            }
          } else {
            const options: KeyConfig['options'] = {}
            if (
              env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_ACCOUNT`]
            ) {
              options.account = Number(
                env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_ACCOUNT`]
              )
            }
            if (env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_INDEX`]) {
              options.index = Number(
                env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_INDEX`]
              )
            }
            if (
              env[`CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_COIN_TYPE`]
            ) {
              options.coinType = Number(
                env[
                  `CHAIN_${index}_WALLET_${walletIndex}_KEY_OPTIONS_COIN_TYPE`
                ]
              )
            }

            if (Object.keys(options).length > 0) {
              key.options = options
            }
          }

          if (Object.keys(key).length > 0 && key.type && key.privateKey) {
            wallet.key = key as KeyConfig
          }

          // other wallet properties
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_MAX_HANDLE_PACKET`]) {
            wallet.maxHandlePacket = Number(
              env[`CHAIN_${index}_WALLET_${walletIndex}_MAX_HANDLE_PACKET`]
            )
          }
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_START_HEIGHT`]) {
            wallet.startHeight = Number(
              env[`CHAIN_${index}_WALLET_${walletIndex}_START_HEIGHT`]
            )
          }
          if (env[`CHAIN_${index}_WALLET_${walletIndex}_PACKET_FILTER`]) {
            try {
              const filterStr =
                env[`CHAIN_${index}_WALLET_${walletIndex}_PACKET_FILTER`] ||
                '{}'
              wallet.packetFilter = safeJsonParse<PacketFilter>(filterStr, {})
            } catch (err) {
              throw new Error(`Error parsing CHAIN_${index}_WALLET_${walletIndex}_PACKET_FILTER environment variable: ${err}`)
            }
          }

          if (Object.keys(wallet).length > 0 && wallet.key) {
            wallets.push(wallet as WalletConfig)
          }
        }

        if (wallets.length > 0) {
          chain.wallets = wallets
        }
      }

      // add a chain to the chains array if it has all required properties
      if (
        chain.chainId &&
        chain.bech32Prefix &&
        chain.gasPrice &&
        chain.restUri &&
        chain.rpcUri &&
        chain.wallets &&
        chain.wallets.length > 0
      ) {
        chains.push(chain as ChainConfig)
      }
    }

    if (chains.length > 0) {
      envConfig.chains = chains
    }
  }

  return envConfig
}

// merge json and env configs, with envs having higher priority
export const mergeConfigs = (
  jsonConfig: Partial<Config>,
  envConfig: Partial<Config>
): Config => {
  const merged: Partial<Config> = {
    ...jsonConfig,
  }

  // merge top-level properties from environment variables (higher priority)
  if (envConfig.port !== undefined) merged.port = envConfig.port
  if (envConfig.metricPort !== undefined)
    merged.metricPort = envConfig.metricPort
  if (envConfig.logLevel !== undefined) merged.logLevel = envConfig.logLevel
  if (envConfig.dbPath !== undefined) merged.dbPath = envConfig.dbPath
  if (envConfig.rpcRequestTimeout !== undefined)
    merged.rpcRequestTimeout = envConfig.rpcRequestTimeout

  // merge chains if provided in environment variables
  if (envConfig.chains && envConfig.chains.length > 0) {
    merged.chains = envConfig.chains
  }

  // check for required properties and throw an error if any are missing
  const missingProps: string[] = []

  if (merged.port === undefined) missingProps.push('port')
  if (merged.metricPort === undefined) missingProps.push('metricPort')
  if (merged.logLevel === undefined) missingProps.push('logLevel')
  if (!merged.chains || merged.chains.length === 0) missingProps.push('chains')

  if (missingProps.length > 0) {
    throw new Error(
      `Missing required configuration properties: ${missingProps.join(', ')}. These must be provided either in config.json or as environment variables.`
    )
  }

  return merged as Config
}

// load configuration from json and environment variables
const jsonConfig = loadJsonConfig()
const envConfig = loadEnvConfig()
export const config: Config = mergeConfigs(jsonConfig, envConfig)

export interface Config {
  port: number
  metricPort: number
  logLevel: string
  dbPath?: string
  rpcRequestTimeout?: number
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
  rpcUri: string | string[]
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
