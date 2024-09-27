import { LCDClient } from '@initia/initia.js'
import { RPCClient } from 'src/lib/rpcClient'
import { createLoggerWithPrefix } from 'src/lib/logger'
import { PacketEvent, PacketType } from 'src/types'
import { parsePacketEvent } from 'src/lib/eventParser'
import { DB } from 'src/db'
import { SyncInfoController } from 'src/db/controller/syncInfo'
import { PacketController } from 'src/db/controller/packet'
import { delay } from 'bluebird'
import { Logger } from 'winston'

export class ChainWorker {
  public latestHeight: number
  public latestTimestamp: number
  public syncWorkers: Record<number, SyncWorker>
  public logger: Logger

  public constructor(
    public chainId: string,
    public lcd: LCDClient,
    public rpc: RPCClient,
    public bech32Prefix: string,
    latestHeight: number,
    startHeights: number[]
  ) {
    this.logger = createLoggerWithPrefix(`<ChainWorker(${this.chainId})>`)
    this.latestHeight = 0
    const syncInfos = SyncInfoController.init(
      chainId,
      startHeights,
      latestHeight
    )
    this.syncWorkers = {}
    for (const syncInfo of syncInfos) {
      this.syncWorkers[syncInfo.start_height] = new SyncWorker(
        this,
        syncInfo.start_height,
        syncInfo.end_height,
        syncInfo.synced_height
      )
      this.latestHeightWorker()
    }
  }

  public terminateSyncWorker(startHeight: number) {
    const endHeight = this.syncWorkers[startHeight].endHeight

    const nextWorker = this.syncWorkers[endHeight]

    // drop sync workers
    delete this.syncWorkers[startHeight]
    delete this.syncWorkers[endHeight]

    // update and store next range worker
    nextWorker.startHeight = startHeight
    this.syncWorkers[startHeight] = nextWorker
  }

  private async latestHeightWorker() {
    this.logger.debug('Activate latest height worekr')
    // TODO add websocket options
    const MAX_RETRY = 10
    let retried = 0
    for (;;) {
      try {
        await this.updateLatestHeight()
        this.logger.debug(
          `Set latest height. Height - ${this.latestHeight}, Timestamp - ${this.latestTimestamp}`
        )

        retried = 0
      } catch (e) {
        this.logger.error(
          `[latestHeightWorker] Got error while fetching latest height (${e})`
        )
        retried++
        if (retried >= MAX_RETRY) {
          throw Error(
            `<${this.chainId}> [latestHeightWorker] Max retry exceeded`
          )
        }
      }
    }
  }

  private async updateLatestHeight() {
    this.latestHeight = await queryLatestHeight(this.rpc)
    this.latestTimestamp = new Date().valueOf() // is it okay to use local timestamp?

    // this.inc(metrics.chain.latestHeightWorker)
  }
}

class SyncWorker {
  private logger: Logger
  public constructor(
    public chain: ChainWorker,
    public startHeight: number,
    public endHeight: number,
    public syncedHeight: number
  ) {
    this.logger = createLoggerWithPrefix(
      `<SyncWorker(${this.chain.chainId}-{${this.startHeight}}-{${this.endHeight}})>`
    )
    this.feedEvents()
  }

  private async feedEvents() {
    this.logger.debug('Activate event feeder')

    for (;;) {
      try {
        // height to fetch
        const endHeight =
          this.endHeight === -1 ? this.chain.latestHeight : this.endHeight
        const heights = Array.from(
          { length: 20 },
          (_, i) => i + this.syncedHeight + 1
        ).filter(
          (height) => height <= endHeight && height <= this.chain.latestHeight
        )

        if (heights.length === 0) continue

        const packetEvenets = await Promise.all(
          heights.map((height) => this.fetchPacketEvents(height))
        )

        this.logger.debug(
          `Fetched block results for heights (${JSON.stringify(heights)})`
        )

        let finish = false

        const feed = await PacketController.feedEvents(
          this.chain.lcd,
          this.chain.chainId,
          packetEvenets.flat()
        )

        DB.transaction(() => {
          feed()

          finish = SyncInfoController.update(
            this.chain.chainId,
            this.startHeight,
            this.endHeight,
            heights[heights.length - 1]
          )

          this.logger.debug(
            `Store packet events(${packetEvenets.flat().length})`
          )
        })()

        this.syncedHeight = heights[heights.length - 1]

        // terminate worker
        if (finish) {
          this.logger.info(
            'Synced height reached to end height. Terminate sync worker'
          )
          this.chain.terminateSyncWorker(this.startHeight)
          break
        }
      } catch (e) {
        this.logger.error(`Fail to fecth block result. resonse - ${e}`)
      } finally {
        await delay(500)
      }
    }
  }

  private async fetchPacketEvents(height: number): Promise<PacketEvent[]> {
    this.logger.debug(`Fecth new block results (height - ${height})`)
    const blockResult = await this.chain.rpc.blockResults(height)
    const txData = [...blockResult.results]

    const packetEvents: PacketEvent[] = []

    txData.map((data, i) => {
      for (const event of data.events) {
        if (
          event.type === 'send_packet' ||
          event.type === 'write_acknowledgement' ||
          event.type === 'acknowledge_packet' ||
          event.type === 'timeout_packet'
        ) {
          let packetInfo = parsePacketEvent(event, height)
          if (packetInfo) {
            packetEvents.push({
              type: event.type as PacketType,
              packetInfo,
            })
          }
        }
      }
    })

    return packetEvents
  }
}

export async function queryLatestHeight(rpc: RPCClient): Promise<number> {
  const abciInfo = await rpc.abciInfo()
  if (!abciInfo.lastBlockHeight) {
    throw Error('Can not get last block height')
  }
  const height = abciInfo.lastBlockHeight
  return Number(height)
}
