import { DB } from '..'
import { SyncInfoController } from './syncInfo'

describe('sync info controller', () => {
  test('start heights of different lengths give a live and a backfill range', () => {
    // a live range at the head and a backfill from an older height, the
    // setup used after a long halt. 9000000 and 10000000 sort the wrong way
    // round as text.
    const syncInfos = SyncInfoController.init(
      'sort-chain-1',
      [10000000, 9000000],
      10000500
    )

    expect(syncInfos).toEqual([
      {
        chain_id: 'sort-chain-1',
        start_height: 9000000,
        end_height: 9999999,
        synced_height: 8999999,
      },
      {
        chain_id: 'sort-chain-1',
        start_height: 10000000,
        end_height: -1,
        synced_height: 9999999,
      },
    ])
    expect(SyncInfoController.getSyncInfos('sort-chain-1')).toHaveLength(2)
  })

  test('the order of the configured start heights does not matter', () => {
    const a = SyncInfoController.init('sort-chain-2', [9000000, 10000000], 1)
    const b = SyncInfoController.init('sort-chain-3', [10000000, 9000000], 1)
    const ranges = (rows: typeof a) =>
      rows.map((r) => [r.start_height, r.end_height])

    expect(ranges(a)).toEqual(ranges(b))
  })

  test('the caller list is not changed', () => {
    const startHeights = [10000000, 9000000]
    SyncInfoController.init('sort-chain-4', startHeights, 1)
    expect(startHeights).toEqual([10000000, 9000000])
  })

  test('timeout packets are selected through the chain pair index', () => {
    const index = DB.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_pt_src_dst'`
    ).get()
    expect(index).toBeDefined()

    const plan = DB.prepare(
      `EXPLAIN QUERY PLAN SELECT * FROM packet_timeout WHERE in_progress = 0 AND src_chain_id = 'a' AND dst_chain_id = 'b' ORDER BY sequence ASC LIMIT 100`
    ).all() as { detail: string }[]
    expect(plan.map((p) => p.detail).join(' ')).toContain('idx_pt_src_dst')
  })
})
