import { DB } from '..'
import { SyncInfoTable } from 'src/types'
import { del, insert, select, update } from '../utils'
import { debug } from '../../lib/logger'

export class SyncInfoController {
  private static tableName = 'sync_info'
  public static init(
    chainId: string,
    startHeights: number[],
    latestHeight: number
  ): SyncInfoTable[] {
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

      insert(DB, SyncInfoController.tableName, syncInfo)
      syncInfos.unshift(syncInfo)
    }

    while (startHeights.length !== 0) {
      const startHeight = startHeights.pop() as number
      for (const syncInfo of syncInfos) {
        if (syncInfo.start_height > startHeight) {
          const newSyncInfo: SyncInfoTable = {
            chain_id: chainId,
            start_height: startHeight,
            end_height: syncInfo.start_height - 1,
            synced_height: startHeight - 1,
          }

          syncInfos.unshift(newSyncInfo)
          insert(DB, SyncInfoController.tableName, newSyncInfo)
        }

        // TODO: split sync info when syncInfo.syncedHeight < startHeight < syncInfo.endHeight
        break
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
    // check finish
    if (syncedHeight === endHeight) {
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

      debug(JSON.stringify(select(DB, SyncInfoController.tableName), null, 2))

      return true
    }

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
