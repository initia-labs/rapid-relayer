import { DB } from '..'
import { FeeType, PacketFeeEvent, PacketFeeTable } from 'src/types'
import { del, insert } from '../utils'
import { Coin, Coins } from '@initia/initia.js'
import { createLoggerWithPrefix } from 'src/lib/logger'

export class PacketFeeController {
  static tableName = 'packet_fee'
  private static logger = createLoggerWithPrefix('[PacketFeeController] ')

  public static feedEvents(
    chainId: string,
    events: PacketFeeEvent[]
  ): () => void {
    PacketFeeController.logger.info(
      `feedEvents: chainId=${chainId}, events.length=${events.length}`
    )
    const feedFns: (() => void)[] = []
    const toFn = (
      event: PacketFeeEvent,
      coins: Coin[],
      type: FeeType
    ): (() => void) => {
      PacketFeeController.logger.info(
        `insert: table=${PacketFeeController.tableName}, chainId=${chainId}, channelId=${event.channelId}, sequence=${event.sequence}, feeType=${type}`
      )
      return () => {
        for (const coin of coins) {
          const packetFee: PacketFeeTable = {
            chain_id: chainId,
            channel_id: event.channelId,
            sequence: event.sequence,
            fee_type: type,
            denom: coin.denom,
            amount: Number(coin.amount),
          }
          insert(DB, PacketFeeController.tableName, packetFee)
        }
      }
    }
    for (const event of events) {
      const recvFee = new Coins(event.recvFee).toArray()
      feedFns.push(toFn(event, recvFee, FeeType.RECV))
      const ackFee = new Coins(event.ackFee).toArray()
      feedFns.push(toFn(event, ackFee, FeeType.ACK))
      const timeoutFee = new Coins(event.timeoutFee).toArray()
      feedFns.push(toFn(event, timeoutFee, FeeType.TIMEOUT))
    }

    return () => {
      for (const fn of feedFns) {
        fn()
      }
    }
  }

  public static removePacketFee(
    chainId: string,
    channelId: string,
    sequence: number,
    type: FeeType
  ) {
    PacketFeeController.logger.info(
      `delete: table=${PacketFeeController.tableName}, chainId=${chainId}, channelId=${channelId}, sequence=${sequence}, feeType=${type}`
    )
    del<PacketFeeTable>(DB, PacketFeeController.tableName, [
      { chain_id: chainId, channel_id: channelId, sequence, fee_type: type },
    ])
  }
}
