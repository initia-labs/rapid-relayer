import { PacketController, PacketFilter } from 'src/db/controller/packet'
import { ChainWorker } from './chain'
import {
  ChannelOnOpenTable,
  ChannelState,
  PacketSendTable,
  PacketTimeoutTable,
  PacketWriteAckTable,
} from 'src/types'
import { WorkerController } from '.'
import { DB } from 'src/db'
import { MsgUpdateClient } from '@initia/initia.js/dist/core/ibc/core/client/msgs'
import { Height } from 'cosmjs-types/ibc/core/client/v1/client'
import { ConnectionController } from 'src/db/controller/connection'
import { Wallet, isTxError } from '@initia/initia.js'
import { createLoggerWithPrefix } from 'src/lib/logger'
import { bech32 } from 'bech32'
import { delay } from 'bluebird'
import { Logger } from 'winston'
import { ChannelController } from 'src/db/controller/channel'
import { State } from '@initia/initia.proto/ibc/core/channel/v1/channel'

// TODO: add update client worker
export class WalletWorker {
  private sequence?: number
  private logger: Logger

  constructor(
    public chain: ChainWorker,
    public workerController: WorkerController,
    private maxHandlePacket: number,
    private wallet: Wallet,
    public packetFilter?: PacketFilter
  ) {
    this.logger = createLoggerWithPrefix(
      `<Wallet(${this.chain.chainId}-${this.address()})>`
    )
    this.run()
  }

  public async run() {
    for (;;) {
      try {
        await this.handlePackets()
      } catch (e) {
        this.logger.error(`[run] ${e}`)
      }
      await delay(500)
    }
  }

  private async handlePackets() {
    if (this.chain.latestHeight === undefined) return

    // get packets to handle
    let remain = this.maxHandlePacket

    const counterpartyChainIds = this.workerController
      .getChainIds()
      .filter((v) => v !== this.chain.chainId)

    const sendPakcets = PacketController.getSendPackets(
      this.chain.chainId,
      this.chain.latestHeight,
      Number((this.chain.latestTimestamp / 1000).toFixed()),
      counterpartyChainIds,
      this.packetFilter,
      remain
    ).filter(
      (packet) =>
        packet.height <
        this.workerController.chains[packet.src_chain_id].latestHeight
    )

    remain -= sendPakcets.length

    const writeAckPackets =
      remain === 0
        ? []
        : PacketController.getWriteAckPackets(
            this.chain.chainId,
            counterpartyChainIds,
            this.packetFilter,
            remain
          ).filter(
            (packet) =>
              packet.height <
              this.workerController.chains[packet.dst_chain_id].latestHeight
          )

    remain -= writeAckPackets.length

    const timeoutPackets =
      remain === 0
        ? []
        : PacketController.getTimeoutPackets(
            this.chain.chainId,
            this.chain.latestHeight,
            Number((this.chain.latestTimestamp / 1000).toFixed()),
            counterpartyChainIds,
            this.packetFilter,
            remain
          )

    const channelOpenEvents =
      remain === 0
        ? []
        : ChannelController.getOpenEvent(
            this.chain.chainId,
            counterpartyChainIds,
            this.packetFilter,
            undefined,
            remain
          )

    // update packet in progress
    DB.transaction(() => {
      sendPakcets.map((packet) =>
        PacketController.updateSendPacketInProgress(packet)
      )
      writeAckPackets.map((packet) =>
        PacketController.updateWriteAckPacketInProgress(packet)
      )
      timeoutPackets.map((packet) =>
        PacketController.updateTimeoutPacketInProgress(packet)
      )
      channelOpenEvents.map((e) => ChannelController.updateInProgress(e.id))
    })()

    try {
      // filter packets
      const filteredSendPackets = await this.filterSendPackets(sendPakcets)
      const filteredWriteAckPackets =
        await this.filterWriteAckPackets(writeAckPackets)
      const filteredTimeoutPackets =
        await this.filterTimeoutPackets(timeoutPackets)
      const filteredChannelOpenEvents =
        await this.filterChannelOpenEvents(channelOpenEvents)

      if (
        filteredSendPackets.length === 0 &&
        filteredWriteAckPackets.length === 0 &&
        filteredTimeoutPackets.length === 0 &&
        filteredChannelOpenEvents.length === 0
      ) {
        return
      }

      // create msgs

      // generate update client msgs
      // get unique client id
      const connections = [
        ...filteredSendPackets.map((packet) => packet.dst_connection_id),
        ...filteredWriteAckPackets.map((packet) => packet.src_connection_id),
        ...filteredTimeoutPackets.map((packet) => packet.src_connection_id),
        ...filteredChannelOpenEvents.map((event) => event.connection_id),
      ].filter((v, i, a) => a.indexOf(v) === i)

      const connectionClientMap: Record<string, string> = {}
      await Promise.all(
        connections.map(async (connection) => {
          const connectionInfo = await ConnectionController.getConnection(
            this.chain.lcd,
            this.chain.chainId,
            connection
          )
          connectionClientMap[connection] = connectionInfo.client_id
        })
      )

      const clientIds = Object.values(connectionClientMap).filter(
        (v, i, a) => a.indexOf(v) === i
      )

      // generate msgs
      const updateClientMsgs: Record<
        string,
        { msg: MsgUpdateClient; height: Height }
      > = {}

      await Promise.all(
        clientIds.map(async (clientId) => {
          updateClientMsgs[clientId] =
            await this.workerController.generateMsgUpdateClient(
              this.chain.chainId,
              clientId,
              this.address()
            )
        })
      )

      // generate recv packet msgs
      const recvPacketMsgs = await Promise.all(
        filteredSendPackets.map((packet) => {
          const clientId = connectionClientMap[packet.dst_connection_id]
          const height = updateClientMsgs[clientId].height

          return this.workerController.generateRecvPacketMsg(
            packet,
            height,
            this.address()
          )
        })
      )

      // generate ack msgs
      const ackMsgs = await Promise.all(
        filteredWriteAckPackets.map((packet) => {
          const clientId = connectionClientMap[packet.src_connection_id]
          const height = updateClientMsgs[clientId].height

          return this.workerController.generateAckMsg(
            packet,
            height,
            this.address()
          )
        })
      )

      // generate timeout msgs
      const timeoutMsgs = await Promise.all(
        filteredTimeoutPackets.map((packet) => {
          const clientId = connectionClientMap[packet.src_connection_id]
          const height = updateClientMsgs[clientId].height

          return this.workerController.generateTimeoutMsg(
            packet,
            height,
            this.address()
          )
        })
      )

      // generate channel open msgs
      const channelOpenMsgs = await Promise.all(
        filteredChannelOpenEvents.map((event) => {
          const clientId = connectionClientMap[event.connection_id]
          const height = updateClientMsgs[clientId].height

          switch (event.state) {
            case ChannelState.INIT:
              return this.workerController.generateChannelOpenTryMsg(
                event,
                height,
                this.address()
              )
            // check src channel state
            case ChannelState.TRYOPEN:
              return this.workerController.generateChannelOpenAckMsg(
                event,
                height,
                this.address()
              )
            // check dst channel state
            case ChannelState.ACK:
              return this.workerController.generateChannelOpenConfirmMsg(
                event,
                height,
                this.address()
              )
          }
        })
      )

      const msgs = [
        ...Object.values(updateClientMsgs).map((v) => v.msg),
        ...recvPacketMsgs,
        ...ackMsgs,
        ...timeoutMsgs,
        ...channelOpenMsgs,
      ]

      const signedTx = await this.wallet.createAndSignTx({
        msgs,
        sequence: this.sequence,
      })

      // update sequence
      if (!this.sequence) {
        this.sequence = signedTx.auth_info.signer_infos[0].sequence
      }

      const result = await this.wallet.lcd.tx.broadcast(signedTx)

      if (isTxError(result)) {
        if (result.raw_log.startsWith('account sequence mismatch')) {
          try {
            const expected = result.raw_log.split(', ')[1]
            this.sequence = Number(expected.split(' ')[1])
            this.logger.info(`update sequence`)
          } catch (e) {
            this.logger.warn(`error to parse sequence`)
          }
        }

        this.logger.error(
          `Tx failed. raw log - ${result.raw_log}, code - ${result.code}`
        )
        throw Error(
          `Tx failed. raw log - ${result.raw_log}, code - ${result.code}`
        )
      }

      this.logger.info(
        `Handled msgs(${msgs.length}). txhash - ${result.txhash}`
      )

      this.sequence++
    } catch (e) {
      if (e?.response?.data) {
        this.logger.error(e.response.data)
      } else {
        this.logger.error(e)
      }

      // revert packet in progress
      DB.transaction(() => {
        sendPakcets.map((packet) =>
          PacketController.updateSendPacketInProgress(packet, false)
        )
        writeAckPackets.map((packet) =>
          PacketController.updateWriteAckPacketInProgress(packet, false)
        )
        timeoutPackets.map((packet) =>
          PacketController.updateTimeoutPacketInProgress(packet, false)
        )
        channelOpenEvents.map((event) =>
          ChannelController.updateInProgress(event.id, false)
        )
      })()
    }
  }

  public address(): string {
    const address = this.wallet.key.accAddress
    return bech32.encode(this.chain.bech32Prefix, bech32.decode(address).words)
  }

  private async filterSendPackets(
    sendPackets: PacketSendTable[]
  ): Promise<PacketSendTable[]> {
    // create path => packet map
    const sendPacketMap: Record<string, PacketSendTable[]> = {}

    for (const packet of sendPackets) {
      const path = `${packet.dst_port}/${packet.dst_channel_id}`
      if (!sendPacketMap[path]) {
        sendPacketMap[path] = []
      }

      sendPacketMap[path].push(packet)
    }

    // filter send packet
    await Promise.all(
      Object.keys(sendPacketMap).map(async (path) => {
        if (sendPacketMap[path].length === 0) return
        const unrecivedPackets = await this.chain.lcd.ibc.unreceivedPackets(
          sendPacketMap[path][0].dst_port,
          sendPacketMap[path][0].dst_channel_id,
          sendPacketMap[path].map((packet) => packet.sequence)
        )

        const unrecivedSequences = unrecivedPackets.sequences.map((sequence) =>
          Number(sequence)
        )

        sendPacketMap[path] = sendPacketMap[path].filter((packet) =>
          unrecivedSequences.includes(packet.sequence)
        )
      })
    )

    return Object.values(sendPacketMap).flat()
  }

  private async filterWriteAckPackets(
    writeAckPackets: PacketWriteAckTable[]
  ): Promise<PacketWriteAckTable[]> {
    // create path => packet map
    const writeAckPacketMap: Record<string, PacketWriteAckTable[]> = {}

    for (const packet of writeAckPackets) {
      const path = `${packet.src_port}/${packet.src_port}`
      if (!writeAckPacketMap[path]) {
        writeAckPacketMap[path] = []
      }

      writeAckPacketMap[path].push(packet)
    }

    // filter write ack packet
    await Promise.all(
      Object.keys(writeAckPacketMap).map(async (path) => {
        if (writeAckPacketMap[path].length === 0) return
        const unrecivedAcks = await this.chain.lcd.ibc.unreceivedAcks(
          writeAckPacketMap[path][0].src_port,
          writeAckPacketMap[path][0].src_channel_id,
          writeAckPacketMap[path].map((packet) => packet.sequence)
        )

        const unrecivedSequences = unrecivedAcks.sequences.map((sequence) =>
          Number(sequence)
        )

        writeAckPacketMap[path] = writeAckPacketMap[path].filter((packet) =>
          unrecivedSequences.includes(packet.sequence)
        )
      })
    )

    return Object.values(writeAckPacketMap).flat()
  }

  private async filterTimeoutPackets(
    timeoutPackets: PacketTimeoutTable[]
  ): Promise<PacketTimeoutTable[]> {
    // create path => packet map
    const timeoutPacketMap: Record<string, PacketTimeoutTable[]> = {}

    for (const packet of timeoutPackets) {
      const path = `${packet.src_port}/${packet.src_port}`
      if (!timeoutPacketMap[path]) {
        timeoutPacketMap[path] = []
      }

      timeoutPacketMap[path].push(packet)
    }

    // filter timeout packet

    // check unreceived ack
    await Promise.all(
      Object.keys(timeoutPacketMap).map(async (path) => {
        if (timeoutPacketMap[path].length === 0) return
        const unrecivedAcks = await this.chain.lcd.ibc.unreceivedAcks(
          timeoutPacketMap[path][0].src_port,
          timeoutPacketMap[path][0].src_channel_id,
          timeoutPacketMap[path].map((packet) => packet.sequence)
        )

        const unrecivedSequences = unrecivedAcks.sequences.map((sequence) =>
          Number(sequence)
        )

        timeoutPacketMap[path] = timeoutPacketMap[path].filter((packet) =>
          unrecivedSequences.includes(packet.sequence)
        )
      })
    )

    // check unreceived packet
    await Promise.all(
      Object.keys(timeoutPacketMap).map(async (path) => {
        if (timeoutPacketMap[path].length === 0) return
        const chain =
          this.workerController.chains[timeoutPacketMap[path][0].dst_chain_id]
        const unrecivedPackets = await chain.lcd.ibc.unreceivedPackets(
          timeoutPacketMap[path][0].dst_port,
          timeoutPacketMap[path][0].dst_channel_id,
          timeoutPacketMap[path].map((packet) => packet.sequence)
        )

        const unrecivedSequences = unrecivedPackets.sequences.map((sequence) =>
          Number(sequence)
        )

        timeoutPacketMap[path] = timeoutPacketMap[path].filter((packet) =>
          unrecivedSequences.includes(packet.sequence)
        )
      })
    )

    return Object.values(timeoutPacketMap).flat()
  }

  private async filterChannelOpenEvents(
    channelOnOpens: ChannelOnOpenTable[]
  ): Promise<ChannelOnOpenTable[]> {
    // filter duplicated open try
    channelOnOpens = channelOnOpens.filter((v, i, a) => {
      if (v.state !== ChannelState.TRYOPEN) {
        return true
      }

      return (
        i ===
        a.findIndex(
          (val) => val.channel_id === v.channel_id && val.port_id === v.port_id
        )
      )
    })

    // check already executed
    const res = await Promise.all(
      channelOnOpens.map(async (v) => {
        const counterpartyChain =
          this.workerController.chains[v.counterparty_chain_id]
        const counterpartyChannel = await counterpartyChain.lcd.ibc.channel(
          v.counterparty_port_id,
          v.counterparty_channel_id
        )
        const channel =
          v.channel_id !== ''
            ? await this.chain.lcd.ibc.channel(v.port_id, v.channel_id)
            : undefined
        switch (v.state) {
          // check src channel state
          case ChannelState.INIT:
            if (counterpartyChannel.channel.state === State.STATE_INIT) {
              return v
            }
            break
          // check src channel state
          case ChannelState.TRYOPEN:
            if (channel && channel.channel.state === State.STATE_INIT) {
              return v
            }
            break
          // check dst channel state
          case ChannelState.ACK:
            if (channel && channel.channel.state === State.STATE_TRYOPEN) {
              return v
            }
            break
        }

        return undefined
      })
    )

    return res.filter((v) => v !== undefined) as ChannelOnOpenTable[]
  }
}
