const mockLogger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}

jest.mock('src/lib/logger', () => ({
  createLoggerWithPrefix: () => ({
    debug: mockLogger.debug,
    error: mockLogger.error,
    info: mockLogger.info,
    warn: mockLogger.warn,
  }),
  debug: mockLogger.debug,
  error: mockLogger.error,
  info: mockLogger.info,
  logger: {
    debug: mockLogger.debug,
    error: mockLogger.error,
    info: mockLogger.info,
    warn: mockLogger.warn,
  },
  warn: mockLogger.warn,
}))

import { bech32 } from 'bech32'
import { WalletWorker } from './wallet'
import { ChainWorker } from './chain'
import { WorkerController } from '.'
import { Wallet } from '@initia/initia.js'

interface TestAccountInfo {
  getSequenceNumber(): number
  getAccountNumber(): number
}

type AccountInfoResponse = TestAccountInfo | Error

interface TestWalletWorker {
  signAndBroadcast(msgs: unknown[]): Promise<void>
  sequenceTracker: {
    sequence(): number
  }
  gasAdjustment: number
}

function accountInfo(sequence: number, accountNumber = 7): TestAccountInfo {
  return {
    getSequenceNumber: () => sequence,
    getAccountNumber: () => accountNumber,
  }
}

function makeAddress(): string {
  return bech32.encode('init', bech32.toWords(Buffer.alloc(20, 1)))
}

function makeWorker(options: {
  accountInfoResponses: AccountInfoResponse[]
  broadcastResult?: unknown
  broadcastError?: Error
}): {
  worker: TestWalletWorker
  authAccountInfo: jest.Mock
  broadcast: jest.Mock
  createAndSignTx: jest.Mock
} {
  const authAccountInfo = jest
    .fn()
    .mockImplementation(() => {
      const response = options.accountInfoResponses.shift()
      if (response instanceof Error) {
        return Promise.reject(response)
      }

      return Promise.resolve(response)
    })
  const broadcast = jest.fn()

  if (options.broadcastError) {
    broadcast.mockRejectedValue(options.broadcastError)
  } else {
    broadcast.mockResolvedValue(options.broadcastResult)
  }

  const createAndSignTx = jest.fn(async ({ msgs }) => ({
    body: { messages: msgs },
  }))

  const wallet = {
    key: { accAddress: makeAddress() },
    rest: {
      auth: { accountInfo: authAccountInfo },
      tx: { broadcast },
    },
    createAndSignTx,
  } as unknown as Wallet

  const worker = new WalletWorker(
    { chainId: 'l1', bech32Prefix: 'init' } as unknown as ChainWorker,
    {} as WorkerController,
    100,
    wallet,
    0n,
    undefined,
    { autoStart: false }
  ) as unknown as TestWalletWorker

  return {
    worker,
    authAccountInfo,
    broadcast,
    createAndSignTx,
  }
}

describe('WalletWorker account sequence reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('does not query account info after successful broadcast beyond initial load', async () => {
    const { worker, authAccountInfo, createAndSignTx } = makeWorker({
      accountInfoResponses: [accountInfo(10)],
      broadcastResult: {
        txhash: 'hash',
        raw_log: '',
        gas_wanted: 1,
        gas_used: 1,
        height: 1,
        logs: [],
        timestamp: '',
      },
    })

    await worker.signAndBroadcast([{}])

    expect(createAndSignTx).toHaveBeenCalledWith({
      msgs: [{}],
      sequence: 10,
      accountNumber: 7,
      gasAdjustment: 1.75,
    })
    expect(worker.sequenceTracker.sequence()).toBe(11)
    expect(authAccountInfo).toHaveBeenCalledTimes(1)
  })

  test('uses parsed expected sequence on sequence mismatch without extra query', async () => {
    const { worker, authAccountInfo } = makeWorker({
      accountInfoResponses: [accountInfo(10)],
      broadcastResult: {
        code: 32,
        raw_log: 'account sequence mismatch, expected 12, got 10',
        txhash: 'hash',
      },
    })

    await expect(worker.signAndBroadcast([{}])).rejects.toThrow(
      'Tx failed. raw log - account sequence mismatch, expected 12, got 10, code - 32'
    )

    expect(worker.sequenceTracker.sequence()).toBe(12)
    expect(authAccountInfo).toHaveBeenCalledTimes(1)
  })

  test('refreshes account sequence after non-sequence tx error', async () => {
    const { worker, authAccountInfo } = makeWorker({
      accountInfoResponses: [accountInfo(10), accountInfo(11)],
      broadcastResult: {
        code: 2,
        raw_log: 'packet already received',
        txhash: 'hash',
      },
    })

    await expect(worker.signAndBroadcast([{}])).rejects.toThrow(
      'Tx failed. raw log - packet already received, code - 2'
    )

    expect(worker.sequenceTracker.sequence()).toBe(11)
    expect(authAccountInfo).toHaveBeenCalledTimes(2)
  })

  test('refreshes account sequence after broadcast timeout exception', async () => {
    const { worker, authAccountInfo } = makeWorker({
      accountInfoResponses: [accountInfo(10), accountInfo(11)],
      broadcastError: new Error(
        'Transaction was not included in a block before timeout of 30000ms'
      ),
    })

    await expect(worker.signAndBroadcast([{}])).rejects.toThrow(
      'Transaction was not included in a block before timeout of 30000ms'
    )

    expect(worker.sequenceTracker.sequence()).toBe(11)
    expect(authAccountInfo).toHaveBeenCalledTimes(2)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Broadcast failed; reconciled account sequence. signedSequence=10, currentSequence=11'
    )
  })

  test('increases gasAdjustment after an out of gas error', async () => {
    const { worker, createAndSignTx } = makeWorker({
      accountInfoResponses: [accountInfo(10), accountInfo(11)],
      broadcastResult: {
        code: 11,
        raw_log:
          'out of gas in location: ReadFlat; gasWanted: 1856904, gasUsed: 1857904: out of gas',
        txhash: 'hash',
      },
    })

    expect(worker.gasAdjustment).toBe(1.75)

    await expect(worker.signAndBroadcast([{}])).rejects.toThrow('out of gas')

    expect(createAndSignTx).toHaveBeenLastCalledWith({
      msgs: [{}],
      sequence: 10,
      accountNumber: 7,
      gasAdjustment: 1.75,
    })
    expect(worker.gasAdjustment).toBeCloseTo(2.1)
  })

  test('resets gasAdjustment after a successful broadcast', async () => {
    const { worker, createAndSignTx } = makeWorker({
      accountInfoResponses: [accountInfo(10)],
      broadcastResult: {
        txhash: 'hash',
        raw_log: '',
        gas_wanted: 1,
        gas_used: 1,
        height: 1,
        logs: [],
        timestamp: '',
      },
    })

    worker.gasAdjustment = 3

    await worker.signAndBroadcast([{}])

    expect(createAndSignTx).toHaveBeenCalledWith({
      msgs: [{}],
      sequence: 10,
      accountNumber: 7,
      gasAdjustment: 3,
    })
    expect(worker.gasAdjustment).toBe(1.75)
  })

  test('does not retry sequence refresh when tx error reconciliation query fails', async () => {
    const { worker, authAccountInfo } = makeWorker({
      accountInfoResponses: [
        accountInfo(10),
        new Error('account info unavailable'),
        accountInfo(11),
      ],
      broadcastResult: {
        code: 2,
        raw_log: 'packet already received',
        txhash: 'hash',
      },
    })

    await expect(worker.signAndBroadcast([{}])).rejects.toThrow(
      'Tx failed. raw log - packet already received, code - 2'
    )

    expect(authAccountInfo).toHaveBeenCalledTimes(2)
  })
})
