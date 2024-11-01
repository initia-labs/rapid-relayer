import {
  Msg,
  SyncTxBroadcastResult,
  Wallet,
  isTxError,
} from '@initia/initia.js'
import { bech32 } from 'bech32'
import { delay } from 'bluebird'
import { error, info, warn } from 'src/lib/logger'

export class WalletManager {
  private requests: Record<
    number,
    { msgs: Msg[]; result: SyncTxBroadcastResult | undefined }
  >
  private requestIndexInprogress: number
  private requestIndex: number
  private sequence: number
  private accountNumber: number
  constructor(
    private wallet: Wallet,
    private bech32Prefix: string
  ) {
    this.requests = {}
    this.requestIndex = 0
    this.requestIndexInprogress = 0
    void this.runRequestWorker()
  }

  async init() {
    const accountInfo = await this.wallet.lcd.auth.accountInfo(this.address())
    this.sequence = accountInfo.getSequenceNumber()
    this.accountNumber = accountInfo.getAccountNumber()
  }

  async request(msgs: Msg[], executeDelay = 0): Promise<TxResult> {
    await delay(executeDelay)
    if (msgs.length === 0) {
      return {
        txhash: '',
        code: 0,
      }
    }
    const index = this.requestIndex++

    this.requests[index] = { msgs, result: undefined }

    while (this.requests[index].result === undefined) {
      await delay(500)
    }

    const result = this.requests[index].result
    // just for avoid lint error
    if (result === undefined) {
      throw Error('Result Not Found')
    }

    delete this.requests[index]
    // polling tx

    if (isTxError(result) && result.code !== 19) {
      return {
        txhash: result.txhash,
        code: Number(result.code),
        rawLog: result.raw_log,
      }
    }

    let retry = 0
    // TODO make this as config
    while (retry < 120) {
      const txResult = await this.wallet.lcd.tx
        .txInfo(result.txhash)
        .catch(() => undefined)
      await delay(500)
      retry++

      if (txResult) {
        return {
          txhash: result.txhash,
          code: txResult.code,
          rawLog: txResult.code === 0 ? undefined : txResult.raw_log,
        }
      }
    }

    return {
      txhash: result.txhash,
      code: -1,
      rawLog: 'timeout',
    }
  }

  private async runRequestWorker() {
    const MAX_RETRY = 10
    let retried = 0
    for (;;) {
      const request = this.requests[this.requestIndexInprogress]
      try {
        if (!this.sequence) {
          await this.init()
        }

        if (!request) continue

        const signedTx = await this.wallet.createAndSignTx({
          msgs: request.msgs,
          sequence: this.sequence,
          accountNumber: this.accountNumber,
        })

        const result = await this.wallet.lcd.tx.broadcastSync(signedTx)
        request.result = result

        this.requestIndexInprogress++

        if (result.raw_log.startsWith('account sequence mismatch')) {
          try {
            const expected = result.raw_log.split(', ')[1]
            this.sequence = Number(expected.split(' ')[1])
            info(`update sequence`)
          } catch (e) {
            warn(`error to parse sequence`)
          }
        }

        if (!(isTxError(result) && result.code !== 19)) {
          this.sequence++
        }
      } catch (e) {
        const errorMsg = e as { response?: { data: string } }
        const errorContent = JSON.stringify(errorMsg?.response?.data ?? e)
        if (errorContent.indexOf('account sequence mismatch') !== -1) {
          const expected = errorContent
            .slice(errorContent.indexOf('account sequence mismatch'))
            .split(', ')[1]
          this.sequence = Number(expected.split(' ')[1])
          info(`update sequence`)
        }

        error(
          `[runRequestWorker] (${JSON.stringify(errorMsg?.response?.data ?? error)})`
        )
        retried++

        // if fail to broadcast, return error result to make regenerate msgs
        if (retried >= MAX_RETRY) {
          this.requestIndexInprogress++
          error(`[runRequestWorker] Max retry exceeded`)
          request.result = {
            txhash: '',
            height: -1,
            code: -1,
            raw_log: '[runRequestWorker] Max retry exceeded',
          }
        }
      } finally {
        await delay(1000)
      }
    }
  }

  public address(): string {
    const address = this.wallet.key.accAddress
    return bech32.encode(this.bech32Prefix, bech32.decode(address).words)
  }
}

interface TxResult {
  txhash: string
  code?: number
  rawLog?: string // only include in code is not zero
}
