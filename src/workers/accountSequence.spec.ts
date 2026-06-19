import {
  AccountSequenceTracker,
  parseExpectedSequenceFromRawLog,
} from './accountSequence'

describe('parseExpectedSequenceFromRawLog', () => {
  test('extracts expected sequence from account sequence mismatch raw log', () => {
    expect(
      parseExpectedSequenceFromRawLog(
        'account sequence mismatch, expected 42, got 41'
      )
    ).toBe(42)
  })

  test('extracts expected sequence from stale nonce raw log', () => {
    expect(
      parseExpectedSequenceFromRawLog(
        'nonce 14299 is stale for sender init1ueyyepx649e67zjremxgfqvyn6fuyl2d3gnrl5 (expected >= 14300): incorrect account sequence, code - 32'
      )
    ).toBe(14300)
  })

  test('returns undefined for unrelated tx errors', () => {
    expect(parseExpectedSequenceFromRawLog('packet already received')).toBe(
      undefined
    )
  })
})

describe('AccountSequenceTracker', () => {
  test('initializes once and increments locally after success without extra query', async () => {
    let calls = 0
    const tracker = new AccountSequenceTracker(async () => {
      calls++
      return { sequence: 10, accountNumber: 7 }
    })

    await tracker.ensureInitialized()
    tracker.markBroadcastSuccess()

    expect(tracker.sequence()).toBe(11)
    expect(tracker.accountNumber()).toBe(7)
    expect(calls).toBe(1)
  })

  test('uses parsed expected sequence on sequence mismatch without extra query', async () => {
    let calls = 0
    const tracker = new AccountSequenceTracker(async () => {
      calls++
      return { sequence: 10, accountNumber: 7 }
    })

    await tracker.ensureInitialized()
    await tracker.reconcileTxError(
      'account sequence mismatch, expected 12, got 10'
    )

    expect(tracker.sequence()).toBe(12)
    expect(calls).toBe(1)
  })

  test('refreshes from chain for non-sequence tx error', async () => {
    let nextSequence = 10
    let calls = 0
    const tracker = new AccountSequenceTracker(async () => {
      calls++
      return { sequence: nextSequence, accountNumber: 7 }
    })

    await tracker.ensureInitialized()
    nextSequence = 11
    await tracker.reconcileTxError('packet already received')

    expect(tracker.sequence()).toBe(11)
    expect(calls).toBe(2)
  })

  test('refreshes from chain for broadcast exception after signed tx', async () => {
    let nextSequence = 10
    const tracker = new AccountSequenceTracker(async () => ({
      sequence: nextSequence,
      accountNumber: 7,
    }))

    await tracker.ensureInitialized()
    nextSequence = 11
    await tracker.reconcileBroadcastException()

    expect(tracker.sequence()).toBe(11)
  })
})
