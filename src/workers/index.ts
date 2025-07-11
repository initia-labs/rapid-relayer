import {ChainWorker, queryLatestHeight} from './chain'
import {WalletWorker} from './wallet'
import {
  generateMsgAck,
  generateMsgChannelOpenAck,
  generateMsgChannelOpenConfirm,
  generateMsgChannelOpenTry,
  generateMsgRecvPacket,
  generateMsgTimeout,
  generateMsgTimeoutOnClose,
  generateMsgUpdateClient,
} from 'src/msgs'
import {Height} from 'cosmjs-types/ibc/core/client/v1/client'
import {ClientController} from 'src/db/controller/client'
import {ChannelOpenCloseTable, PacketSendTable, PacketTimeoutTable, PacketWriteAckTable,} from 'src/types'
import {
  APIRequester,
  Coins,
  Key,
  MnemonicKey,
  MsgChannelCloseConfirm,
  MsgChannelOpenAck,
  MsgChannelOpenConfirm,
  MsgChannelOpenTry,
  MsgRecvPacket,
  MsgUpdateClient,
  RawKey,
  Wallet,
} from '@initia/initia.js'
import {Config, KeyConfig, PacketFee} from 'src/lib/config'
import {env} from 'node:process'
import {RPCClient} from 'src/lib/rpcClient'
import * as http from 'http'
import * as https from 'https'
import {PacketFilter} from 'src/db/controller/packet'
import {RESTClient} from 'src/lib/restClient'

import {State} from '@initia/initia.proto/ibc/core/channel/v1/channel'
import {generateMsgChannelCloseConfirm} from 'src/msgs/channelCloseConfirm'
import {bech32} from 'bech32'

export class WorkerController {
  public chains: Record<string, ChainWorker> // chainId => ChainWorker
  public wallets: Record<string, WalletWorker> // chainId::addr => WalletWorker
  public initiated: boolean

  public constructor() {
    this.chains = {}
    this.wallets = {}
    this.initiated = false
  }

  public stopAllWorkers() {
    for (const chain of Object.values(this.chains)) {
      chain.stop();
    }
    for (const wallet of Object.values(this.wallets)) {
      wallet.stop();
    }
  }

  /**
   * Check if this node is active
   * Default implementation always returns true
   * This method is overridden in RaftWorkerController
   */
  public isActiveNode(): boolean {
    return true
  }

  /**
   * Check if this node is the leader
   * Default implementation always returns true
   * This method is overridden in RaftWorkerController
   */
  public isLeader(): boolean {
    return true
  }

  public async init(config: Config) {
    if (this.initiated) {
      throw Error('already initiated')
    }
    this.initiated = true

    for (const chainConfig of config.chains) {
      const rest = new RESTClient(
        chainConfig.restUri,
        {
          chainId: chainConfig.chainId,
          gasPrices: chainConfig.gasPrice,
        },
        new APIRequester(chainConfig.restUri, {
          httpAgent: new http.Agent({ keepAlive: true }),
          httpsAgent: new https.Agent({ keepAlive: true }),
          timeout: 60000,
        })
      )
      const rpc = new RPCClient(chainConfig.rpcUri)
      const latestHeight = await queryLatestHeight(rpc)
      const chain = new ChainWorker(
        chainConfig.chainId,
        rest,
        rpc,
        chainConfig.bech32Prefix,
        chainConfig.feeFilter ?? {},
        latestHeight,
        chainConfig.wallets
          .map((wallet) => wallet.startHeight)
          .filter((v) => v !== undefined)
      )

      this.chains[chainConfig.chainId] = chain

      for (const walletConfig of chainConfig.wallets) {
        const key = createKey(walletConfig.key)
        const address = bech32.encode(
          chainConfig.bech32Prefix,
          bech32.decode(key.accAddress).words
        )
        const balance = BigInt(
          await rest.bank
            .balanceByDenom(
              address,
              new Coins(rest.config.gasPrices as Coins.Input).toArray()[0].denom
            )
            .then((coin) => coin.amount)
        )
        this.wallets[`${chainConfig.chainId}::${address}`] = new WalletWorker(
          chain,
          this,
          walletConfig.maxHandlePacket ?? 100,
          new Wallet(rest, key),
          balance,
          walletConfig.packetFilter
        )
      }
    }
  }

  public getFeeFilters(): { chainId: string; feeFilter: PacketFee }[] {
    return Object.entries(this.chains).map(([chainId, chain]) => {
      return {
        chainId,
        feeFilter: chain.feeFilter,
      }
    })
  }

  public getStatus(): { chains: ChainStatus[] } {
    const wallets = Object.values(this.wallets)
    const chains: ChainStatus[] = Object.values(this.chains).map((chain) => {
      const syncWorkerKeys = Object.keys(chain.syncWorkers)
      const syncWorkers = syncWorkerKeys.map((key) => {
        const syncWorker = chain.syncWorkers[Number(key)]
        return {
          startHeight: syncWorker.startHeight,
          endHeight: syncWorker.endHeight === -1 ? null : syncWorker.endHeight,
          syncedHeight: syncWorker.syncedHeight,
        }
      })

      const walletWorkers = wallets
        .filter((wallet) => wallet.chain.chainId === chain.chainId)
        .map((wallet) => {
          return {
            address: wallet.address(),
            gasTokenBalance: wallet.gasTokenBalance.toString(),
            lastExecutionTimestamp: wallet.lastExecutionTimestamp,
            pendingPacketCount: wallet.getPendingPacketCount(),
            packetFilter: wallet.packetFilter,
          }
        })

      return {
        chainId: chain.chainId,
        latestHeight: chain.latestHeight,
        latestTimestamp: new Date(chain.latestTimestamp),
        syncWorkers,
        walletWorkers,
      }
    })

    return {
      chains,
    }
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
      this.chains[chainId].rest,
      chainId,
      clientId
    )

    return generateMsgUpdateClient(
      this.chains[client.counterparty_chain_id],
      this.chains[chainId],
      client.client_id,
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
    // check dst channel state
    const channel = await dstChain.rest.ibc.channel(
      packet.dst_port,
      packet.dst_channel_id
    )
    if (channel.channel.state === State.STATE_CLOSED) {
      return generateMsgTimeoutOnClose(
        dstChain,
        packet,
        height,
        executorAddress
      )
    }
    return generateMsgTimeout(dstChain, packet, height, executorAddress)
  }

  async generateChannelOpenTryMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenTry> {
    const srcChain = this.chains[event.counterparty_chain_id]
    return generateMsgChannelOpenTry(
      srcChain,
      event.counterparty_port_id,
      event.counterparty_channel_id,
      event.connection_id,
      event.port_id,
      height,
      executorAddress
    )
  }

  async generateChannelOpenAckMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenAck> {
    const dstChain = this.chains[event.counterparty_chain_id]
    return generateMsgChannelOpenAck(
      event.port_id,
      event.channel_id,
      dstChain,
      event.counterparty_port_id,
      event.counterparty_channel_id,
      height,
      executorAddress
    )
  }

  async generateChannelOpenConfirmMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelOpenConfirm> {
    const srcChain = this.chains[event.counterparty_chain_id]
    return generateMsgChannelOpenConfirm(
      srcChain,
      event.counterparty_port_id,
      event.counterparty_channel_id,
      event.port_id,
      event.channel_id,
      height,
      executorAddress
    )
  }

  async generateChannelCloseConfirmMsg(
    event: ChannelOpenCloseTable,
    height: Height,
    executorAddress: string
  ): Promise<MsgChannelCloseConfirm> {
    const srcChain = this.chains[event.counterparty_chain_id]
    return generateMsgChannelCloseConfirm(
      srcChain,
      event.counterparty_port_id,
      event.counterparty_channel_id,
      event.port_id,
      event.channel_id,
      height,
      executorAddress
    )
  }
}

function createKey(rawKey: KeyConfig): Key {
  let keyReturn
  switch (rawKey.type) {
    case 'mnemonic': {
      const options = rawKey.options || { coinType: 118 }

      keyReturn = new MnemonicKey({
        mnemonic: rawKey.privateKey,
        ...options,
        eth: false,
      })
      break
    }
    case 'env_mnemonic': {
      const key = env[rawKey.privateKey]
      if (!key) {
        throw Error(`missing environment ${rawKey.privateKey}`)
      }
      const options = rawKey.options || { coinType: 118 }

      keyReturn = new MnemonicKey({ mnemonic: key, ...options, eth: false })
      break
    }
    case 'raw': {
      keyReturn = new RawKey(Buffer.from(rawKey.privateKey, 'hex'), false)
      break
    }
    case 'env_raw': {
      const key = env[rawKey.privateKey]
      if (!key) {
        throw Error(`missing environment ${rawKey.privateKey}`)
      }
      keyReturn = new RawKey(Buffer.from(key, 'hex'), false)
      break
    }
  }
  return keyReturn
}

interface ChainStatus {
  chainId: string
  latestHeight: number
  latestTimestamp: Date
  syncWorkers: {
    startHeight: number
    endHeight: number | null
    syncedHeight: number
  }[]
  walletWorkers: {
    address: string
    gasTokenBalance: string
    lastExecutionTimestamp: Date
    pendingPacketCount: number
    packetFilter?: PacketFilter
  }[]
}
