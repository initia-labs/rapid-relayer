import { Key, MnemonicKey, RawKey } from '@initia/initia.js'
import { Chain } from 'src/chain'
import { SyncInfo } from 'src/chain/types'
import { env } from 'node:process'

export async function runPair(
  config: ConfigPair
): Promise<{ name: string; chainA: Chain; chainB: Chain }> {
  const keyA = createKey(config.chainA.key)
  const keyB = createKey(config.chainB.key)

  const chainA = await Chain.init({
    ...config.chainA,
    key: keyA,
  })

  const chainB = await Chain.init({
    ...config.chainB,
    key: keyB,
  })

  await chainA.registerCounterpartyChain(chainB)
  await chainB.registerCounterpartyChain(chainA)

  return {
    name: config.name ?? `${config.chainA.chainId} - ${config.chainB.chainId}`,
    chainA,
    chainB,
  }
}

function createKey(rawKey: ChainRawKeyConfig): Key {
  let keyReturn
  switch (rawKey.type) {
    case 'mnemonic': {
      const options = rawKey.options || {}

      keyReturn = new MnemonicKey({ mnemonic: rawKey.privateKey, ...options })
      break
    }
    case 'env_mnemonic': {
      const key = env[rawKey.privateKey]
      if (!key) {
        throw Error(`missing environment ${rawKey.privateKey}`)
      }
      const options = rawKey.options || {}

      keyReturn = new MnemonicKey({ mnemonic: key, ...options })
      break
    }
    case 'raw': {
      keyReturn = new RawKey(Buffer.from(rawKey.privateKey, 'hex'))
      break
    }
    case 'env_raw': {
      const key = env[rawKey.privateKey]
      if (!key) {
        throw Error(`missing environment ${rawKey.privateKey}`)
      }
      keyReturn = new RawKey(Buffer.from(key, 'hex'))
      break
    }
  }
  return keyReturn
}

interface ChainRawKeyConfig {
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

interface ChainRawConfig {
  bech32Prefix: string
  chainId: string
  gasPrice: string
  lcdUri: string
  rpcUri: string
  key: ChainRawKeyConfig
  connectionId: string
  syncInfo?: SyncInfo // if syncInfo file exists, ignore start height
}

export interface ConfigPair {
  name?: string
  chainA: ChainRawConfig
  chainB: ChainRawConfig
}
