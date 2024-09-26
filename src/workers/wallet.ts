import { PacketController, PacketFilter } from 'src/db/controller/packet'
import { ChainWorker } from './chain'
import {
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
import { debug, error, info, warn } from 'src/lib/logger'
import { bech32 } from 'bech32'
import { delay } from 'bluebird'

// TODO: add update client worker
export class WalletWorker {
  private sequence?: number

  constructor(
    public chain: ChainWorker,
    public workerController: WorkerController,
    private maxHandlePacket: number,
    private wallet: Wallet,
    public packetFilter?: PacketFilter
  ) {
    this.run()
  }

  public async run() {
    for (;;) {
      try {
        await this.handlePackets()
      } catch (e) {
        this.error(`[run] ${e}`)
      }
      await delay(500)
    }
  }

  private async handlePackets() {
    if (this.chain.latestHeight === 0) return

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
    })()

    try {
      // filter packets
      const filteredSendPackets = await this.filterSendPackets(sendPakcets)
      const filteredWriteAckPackets =
        await this.filterWriteAckPackets(writeAckPackets)
      const filteredTimeoutPackets =
        await this.filterTimeoutPackets(timeoutPackets)

      if (
        filteredSendPackets.length === 0 &&
        filteredWriteAckPackets.length === 0 &&
        filteredTimeoutPackets.length === 0
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
      ].filter((v, i, a) => a.indexOf(v) === i) // filter by connection first

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

      const msgs = [
        ...Object.values(updateClientMsgs).map((v) => v.msg),
        ...recvPacketMsgs,
        ...ackMsgs,
        ...timeoutMsgs,
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
            this.info(`update sequence`)
          } catch (e) {
            this.warn(`error to parse sequence`)
          }
        }

        this.error(
          `Tx failed. raw log - ${result.raw_log}, code - ${result.code}`
        )
        throw Error(
          `Tx failed. raw log - ${result.raw_log}, code - ${result.code}`
        )
      }

      this.sequence++
    } catch (e) {
      this.error(JSON.stringify(e, undefined, 2))
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

  // logs

  private info(log: string) {
    info(`<Wallet(${this.chain.chainId}-${this.address()})> ${log}`)
  }

  private warn(log: string) {
    warn(`<Wallet(${this.chain.chainId}-${this.address()})> ${log}`)
  }

  private error(log: string) {
    error(`<Wallet(${this.chain.chainId}-${this.address()})> ${log}`)
  }

  private debug(log: string) {
    debug(`<Wallet(${this.chain.chainId}-${this.address()})> ${log}`)
  }
}
