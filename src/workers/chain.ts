import { RPCClient } from 'src/lib/rpcClient'
import { createLoggerWithPrefix } from 'src/lib/logger'
import {
  ChannelOpenCloseEvent,
  PacketEvent,
  PacketFeeEvent,
  UpdateClientEvent,
} from 'src/types'
import {
  parseChannelCloseEvent,
  parseChannelOpenEvent,
  parsePacketEvent,
  parsePacketFeeEvent,
  parseReplaceClientEvent,
  parseUpdateClientEvent,
} from 'src/lib/eventParser'
import { DB } from 'src/db'
import { SyncInfoController } from 'src/db/controller/syncInfo'
import { PacketController } from 'src/db/controller/packet'
import { setTimeout as delay } from 'timers/promises'
import { Logger } from 'winston'
import { RESTClient } from 'src/lib/restClient'
import { ChannelController } from 'src/db/controller/channel'
import { PacketFeeController } from 'src/db/controller/packetFee'
import { PacketFee } from 'src/lib/config'
import { ClientController } from 'src/db/controller/client'
import { captureException } from 'src/lib/sentry'

export class ChainWorker {
  public latestTimestamp: number
  public syncWorkers: Record<number, SyncWorker>
  public logger: Logger

  public constructor(
    public chainId: string,
    public rest: RESTClient,
    public rpc: RPCClient,
    public bech32Prefix: string,
    public feeFilter: PacketFee,
    public latestHeight: number,
    startHeights: number[]
  ) {
    this.logger = createLoggerWithPrefix(`<ChainWorker(${this.chainId})>`)
    const syncInfos = SyncInfoController.init(
      chainId,
      startHeights,
      latestHeight
    )
    this.syncWorkers = {}
    this.latestTimestamp = Date.now()
    for (const syncInfo of syncInfos) {
      this.syncWorkers[syncInfo.start_height] = new SyncWorker(
        this,
        syncInfo.start_height,
        syncInfo.end_height,
        syncInfo.synced_height
      )
      void this.latestHeightWorker()
    }
  }

  public terminateSyncWorker(startHeight: number) {
    const endHeight = this.syncWorkers[startHeight].endHeight

    const nextWorker = this.syncWorkers[endHeight + 1]

    // drop sync workers
    delete this.syncWorkers[startHeight]
    delete this.syncWorkers[endHeight + 1]

    // update and store next range worker
    nextWorker.startHeight = startHeight
    this.syncWorkers[startHeight] = nextWorker
  }

  private async latestHeightWorker() {
    this.logger.debug('Activate latest height worker')
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
          await captureException(e instanceof Error ? e : new Error(String(e)))
          throw Error(
            `<${this.chainId}> [latestHeightWorker] Max retry exceeded`
          )
        }
      } finally {
        await delay(1000)
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
    void this.feedEvents()
  }

  private async feedEvents() {
    this.logger.debug('Activate event feeder')
    const MAX_RETRY = 10
    let retried = 0
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

        const events = await Promise.all(
          heights.map((height) => this.fetchEvents(height))
        )
        const packetEvents = events.map((e) => e.packetEvents).flat()
        const channelOpenEvents = events.map((e) => e.channelOpenEvents).flat()
        const packetFeeEvents = events.map((e) => e.packetFeeEvents).flat()
        const updateClientEvents = events
          .map((e) => e.updateClientEvents)
          .flat()
        const replaceClientEvents = events
          .map((e) => e.replaceClientEvents)
          .flat()

        this.logger.debug(
          `Fetched block results for heights (${JSON.stringify(heights)})`
        )

        // `feedUpdateClient` does not need to be included in the db transaction
        for (const event of updateClientEvents) {
          await ClientController.feedUpdateClientEvent(
            this.chain.rest,
            this.chain.chainId,
            event
          )
        }

        // `upgradeClient` and `recoverClient` does not need to be included in the db transaction
        for (const clientId of replaceClientEvents) {
          await ClientController.replaceClient(
            this.chain.rest,
            this.chain.chainId,
            clientId
          )
        }

        let finish = false

        const packetEventFeed = await PacketController.feedEvents(
          this.chain.rest,
          this.chain.chainId,
          packetEvents
        )

        const channelOpenEventFeed = await ChannelController.feedEvents(
          this.chain.rest,
          this.chain.chainId,
          channelOpenEvents
        )

        DB.transaction(() => {
          packetEventFeed()
          channelOpenEventFeed()
          PacketFeeController.feedEvents(this.chain.chainId, packetFeeEvents)()

          finish = SyncInfoController.update(
            this.chain.chainId,
            this.startHeight,
            this.endHeight,
            heights[heights.length - 1]
          )

          this.logger.debug(
            `Store packet events(${packetEvents.flat().length})`
          )
        })()

        this.syncedHeight = heights[heights.length - 1]
        retried = 0
        // terminate worker
        if (finish) {
          this.logger.info(
            'Synced height reached to end height. Terminate sync worker'
          )
          this.chain.terminateSyncWorker(this.startHeight)
          break
        }
      } catch (e) {
        retried++
        const errorMsg = `Fail to fecth block result. resonse - ${e}`
        if (retried === MAX_RETRY) {
          await captureException(
            e instanceof Error ? e : new Error(String(errorMsg))
          )
        }
        this.logger.error(errorMsg)
      } finally {
        await delay(500)
      }
    }
  }

  private async fetchEvents(height: number): Promise<{
    packetEvents: PacketEvent[]
    channelOpenEvents: ChannelOpenCloseEvent[]
    packetFeeEvents: PacketFeeEvent[]
    updateClientEvents: UpdateClientEvent[]
    replaceClientEvents: string[]
  }> {
    this.logger.debug(`Fetch new block results (height - ${height})`)
    const blockResult = await this.chain.rpc.blockResults(height)

    const events = [
      // parse events from begin block
      ...blockResult.beginBlockEvents,

      // parse events from txs
      ...blockResult.results.map((res) => res.events).flat(),

      // parse events from end block
      ...blockResult.endBlockEvents,
    ]

    const packetEvents: PacketEvent[] = []
    const channelOpenEvents: ChannelOpenCloseEvent[] = []
    const packetFeeEvents: PacketFeeEvent[] = []
    const updateClientEvents: UpdateClientEvent[] = []
    const replaceClientEvents: string[] = []

    for (const event of events) {
      if (
        event.type === 'send_packet' ||
        event.type === 'write_acknowledgement' ||
        event.type === 'acknowledge_packet' ||
        event.type === 'timeout_packet'
      ) {
        packetEvents.push({
          type: event.type,
          packetInfo: parsePacketEvent(event, height),
        })
      }

      if (
        event.type === 'channel_open_init' ||
        event.type === 'channel_open_try' ||
        event.type === 'channel_open_ack' ||
        event.type === 'channel_open_confirm'
      ) {
        channelOpenEvents.push({
          type: event.type,
          channelOpenCloseInfo: parseChannelOpenEvent(event, height),
        })
      }

      if (
        event.type === 'channel_close_init' ||
        event.type === 'channel_close' ||
        event.type === 'channel_close_confirm'
      ) {
        channelOpenEvents.push({
          type: event.type,
          channelOpenCloseInfo: parseChannelCloseEvent(event, height),
        })
      }

      if (event.type === 'incentivized_ibc_packet') {
        packetFeeEvents.push(parsePacketFeeEvent(event))
      }

      if (event.type === 'update_client') {
        updateClientEvents.push(parseUpdateClientEvent(event))
      }

      if (event.type === 'upgrade_client' || event.type === 'recover_client') {
        replaceClientEvents.push(parseReplaceClientEvent(event))
      }
    }

    return {
      packetEvents,
      channelOpenEvents,
      packetFeeEvents,
      updateClientEvents,
      replaceClientEvents,
    }
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
