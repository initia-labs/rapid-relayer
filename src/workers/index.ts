import { ChainWorker, queryLatestHeight } from './chain'
import { WalletWorker } from './wallet'
import {
  generateMsgAck,
  generateMsgRecvPacket,
  generateMsgTimeout,
  generateMsgUpdateClient,
} from 'src/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { MsgUpdateClient } from '@initia/initia.js/dist/core/ibc/core/client/msgs'
import { ClientController } from 'src/db/controller/client'
import {
  PacketSendTable,
  PacketTimeoutTable,
  PacketWriteAckTable,
} from 'src/types'
import {
  MsgRecvPacket,
  Key,
  MnemonicKey,
  RawKey,
  LCDClient,
  APIRequester,
  Wallet,
} from '@initia/initia.js'
import { Config, KeyConfig } from 'src/lib/config'
import { env } from 'node:process'
import { RPCClient } from 'src/lib/rpcClient'
import * as http from 'http'
import * as https from 'https'

export class WorkerController {
  public chains: Record<string, ChainWorker> // chainId => ChainWorker
  public wallets: Record<string, WalletWorker> // chainId::addr => WalletWorker
  public initiated: boolean

  public constructor() {
    this.chains = {}
    this.wallets = {}
    this.initiated = false
  }

  public async init(config: Config) {
    if (this.initiated) {
      throw Error('already initiated')
    }
    this.initiated = true

    for (const chainConfig of config.chains) {
      const lcd = new LCDClient(
        chainConfig.lcdUri,
        {
          chainId: chainConfig.chainId,
          gasPrices: chainConfig.gasPrice,
        },
        new APIRequester(chainConfig.lcdUri, {
          httpAgent: new http.Agent({ keepAlive: true }),
          httpsAgent: new https.Agent({ keepAlive: true }),
          timeout: 60000,
        })
      )
      const rpc = new RPCClient(chainConfig.rpcUri)
      const latestHeight = await queryLatestHeight(rpc)
      const chain = new ChainWorker(
        chainConfig.chainId,
        lcd,
        rpc,
        chainConfig.bech32Prefix,
        latestHeight,
        chainConfig.wallets
          .map((wallet) => wallet.startHeight)
          .filter((v) => v !== undefined) as number[]
      )

      this.chains[chainConfig.chainId] = chain

      for (const walletConfig of chainConfig.wallets) {
        const key = createKey(walletConfig.key)
        const wallet = new WalletWorker(
          chain,
          this,
          walletConfig.maxHandlePakcet ?? 100,
          new Wallet(lcd, key),
          walletConfig.packetFilter
        )

        this.wallets[`${chainConfig.chainId}::${wallet.address()}`]
      }
    }
  }

  public getChainIds(): string[] {
    return Object.keys(this.chains)
  }

  async generateMsgUpdateClient(
    chainId: string,
    clientId: string,
    executorAddress: string
  ): Promise<{
    msg: MsgUpdateClient
    height: Height
  }> {
    // get client
    const client = await ClientController.getClient(
      this.chains[chainId].lcd,
      chainId,
      clientId
    )

    return generateMsgUpdateClient(
      this.chains[chainId],
      this.chains[client.counterparty_chain_id],
      client.counterparty_chain_id,
      executorAddress
    )
  }

  async generateRecvPacketMsg(
    packet: PacketSendTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgRecvPacket> {
    const srcChain = this.chains[packet.src_chain_id]
    return generateMsgRecvPacket(srcChain, packet, height, executorAddress)
  }

  async generateAckMsg(
    packet: PacketWriteAckTable,
    height: Height,
    executorAddress: string
  ) {
    const dstChain = this.chains[packet.dst_chain_id]
    return generateMsgAck(dstChain, packet, height, executorAddress)
  }

  async generateTimeoutMsg(
    packet: PacketTimeoutTable,
    height: Height,
    executorAddress: string
  ) {
    const dstChain = this.chains[packet.dst_chain_id]
    return generateMsgTimeout(dstChain, packet, height, executorAddress)
  }
}

function createKey(rawKey: KeyConfig): Key {
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
