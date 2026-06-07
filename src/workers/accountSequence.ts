export interface AccountSequenceSnapshot {
  sequence: number
  accountNumber: number
}

export type FetchAccountSequence = () => Promise<AccountSequenceSnapshot>

export function parseExpectedSequenceFromRawLog(
  rawLog?: string
): number | undefined {
  if (!rawLog) {
    return undefined
  }

  const match = rawLog.match(/account sequence mismatch.*expected\s+(\d+)/i)
  if (!match) {
    return undefined
  }

  const parsed = Number(match[1])
  return Number.isFinite(parsed) ? parsed : undefined
}

export class AccountSequenceTracker {
  private cachedSequence?: number
  private cachedAccountNumber?: number

  public constructor(
    private readonly fetchAccountSequence: FetchAccountSequence
  ) {}

  public async ensureInitialized(): Promise<void> {
    if (
      this.cachedSequence !== undefined &&
      this.cachedAccountNumber !== undefined
    ) {
      return
    }

    await this.refresh()
  }

  public sequence(): number {
    if (this.cachedSequence === undefined) {
      throw new Error('Account sequence is not initialized')
    }

    return this.cachedSequence
  }

  public accountNumber(): number {
    if (this.cachedAccountNumber === undefined) {
      throw new Error('Account number is not initialized')
    }

    return this.cachedAccountNumber
  }

  public markBroadcastSuccess(): void {
    this.cachedSequence = this.sequence() + 1
  }

  public async reconcileTxError(rawLog?: string): Promise<void> {
    const expectedSequence = parseExpectedSequenceFromRawLog(rawLog)
    if (expectedSequence !== undefined) {
      this.cachedSequence = expectedSequence
      return
    }

    await this.refresh()
  }

  public async reconcileBroadcastException(): Promise<void> {
    await this.refresh()
  }

  private async refresh(): Promise<void> {
    const snapshot = await this.fetchAccountSequence()
    this.cachedSequence = snapshot.sequence
    this.cachedAccountNumber = snapshot.accountNumber
  }
}
