import { DB } from '..'
import { SyncInfoTable } from 'src/types'
import { del, insert, select, update } from '../utils'
import { createLoggerWithPrefix } from 'src/lib/logger'

export class SyncInfoController {
  private static tableName = 'sync_info'
  private static logger = createLoggerWithPrefix('[SyncInfoController] ')
  public static init(
    chainId: string,
    startHeights: number[],
    latestHeight: number
  ): SyncInfoTable[] {
    SyncInfoController.logger.info(`init: chainId=${chainId}, startHeights=${JSON.stringify(startHeights)}, latestHeight=${latestHeight}`)
    startHeights = startHeights.sort()
    const syncInfos = this.getSyncInfos(chainId)

    if (syncInfos.length === 0) {
      if (startHeights.length === 0) {
        startHeights.push(latestHeight)
      }
      const startHeight = startHeights.pop() as number

      const syncInfo: SyncInfoTable = {
        chain_id: chainId,
        start_height: startHeight,
        end_height: -1,
        synced_height: startHeight - 1,
      }

      SyncInfoController.logger.info(`insert: table=${SyncInfoController.tableName}, chainId=${chainId}, startHeight=${startHeight}`)
      insert(DB, SyncInfoController.tableName, syncInfo)
      syncInfos.unshift(syncInfo)
    }

    while (startHeights.length !== 0) {
      const startHeight = startHeights.pop() as number
      const syncInfo = syncInfos[0]
      if (syncInfo && syncInfo.start_height > startHeight) {
        const newSyncInfo: SyncInfoTable = {
          chain_id: chainId,
          start_height: startHeight,
          end_height: syncInfo.start_height - 1,
          synced_height: startHeight - 1,
        }

        SyncInfoController.logger.info(`insert: table=${SyncInfoController.tableName}, chainId=${chainId}, startHeight=${startHeight}`)
        syncInfos.unshift(newSyncInfo)
        insert(DB, SyncInfoController.tableName, newSyncInfo)
      }
    }

    return syncInfos
  }

  public static getSyncInfos(chainId: string): SyncInfoTable[] {
    return select<SyncInfoTable>(DB, SyncInfoController.tableName, [
      { chain_id: chainId },
    ])
  }

  /**
   * update `syncedHeight`.
   * If `syncedHeight` reach to `endHeight`, merge syncInfo to next range and return true
   * @param chainId
   * @param startHeight
   * @param endHeight
   * @param syncedHeight
   * @returns
   */
  public static update(
    chainId: string,
    startHeight: number,
    endHeight: number,
    syncedHeight: number
  ): boolean {
    SyncInfoController.logger.info(`update: table=${SyncInfoController.tableName}, chainId=${chainId}, startHeight=${startHeight}, endHeight=${endHeight}, syncedHeight=${syncedHeight}`)
    // check finish
    if (syncedHeight === endHeight) {
      SyncInfoController.logger.info(`delete: table=${SyncInfoController.tableName}, chainId=${chainId}, startHeight=${startHeight}`)
      del(DB, SyncInfoController.tableName, [
        { chain_id: chainId, start_height: startHeight },
      ])

      update<SyncInfoTable>(
        DB,
        SyncInfoController.tableName,
        { start_height: startHeight },
        [
          {
            chain_id: chainId,
            start_height: endHeight + 1,
          },
        ]
      )

      console.log(select(DB, SyncInfoController.tableName))

      return true
    }

    SyncInfoController.logger.info(`update: table=${SyncInfoController.tableName}, chainId=${chainId}, startHeight=${startHeight}, syncedHeight=${syncedHeight}`)
    update<SyncInfoTable>(
      DB,
      SyncInfoController.tableName,
      { synced_height: syncedHeight },
      [
        {
          chain_id: chainId,
          start_height: startHeight,
        },
      ]
    )

    return false
  }
}
