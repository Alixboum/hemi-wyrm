/**
 * On-chain session layer. Every life is one session on the active Hemi network:
 *   1. `open()`   — startSession() transaction, required before the worm spawns;
 *   2. `submit()` — submitScore(sessionId, peakLength) transaction once the worm dies.
 * The leaderboard is read straight from the contract.
 */
import { classify, HemiChain, type BoardEntry } from '../chain/hemi'

export type OnlineStatus = 'pending' | 'mining' | 'submitted' | 'rejected' | 'unavailable' | 'unranked' | 'noSession'
export type OnlineOutcome = { status: OnlineStatus; score: number; hash?: string; newBest?: boolean }
export type SessionStep = 'connect' | 'network' | 'sign' | 'mining'

export class Online {
  readonly chain = new HemiChain()
  /** Session opened for the current life; cleared once its score is submitted. */
  session: bigint | null = null
  private pendingScore: { session: bigint; score: number } | null = null
  cached: BoardEntry[] | null = null

  /** Opens a new on-chain session. Throws a ChainError on refusal or failure. */
  async open(step: (s: SessionStep, hash?: string) => void): Promise<bigint> {
    this.session = null
    this.pendingScore = null
    if (!this.chain.account) {
      step('connect')
      await this.chain.connect()
    }
    step('network')
    await this.chain.ensureNetwork()
    step('sign')
    const { sessionId } = await this.chain.startSession(hash => step('mining', hash))
    this.session = sessionId
    return sessionId
  }

  /**
   * Records the life's score for the open session. `update` receives every status change so the
   * death screen can follow the transaction from wallet prompt to confirmation.
   */
  submit(score: number, unranked: boolean, update: (o: OnlineOutcome) => void): Promise<OnlineOutcome> {
    const s = Math.max(0, Math.floor(score))
    const session = this.session
    this.session = null
    if (unranked) return Promise.resolve(emit(update, { status: 'unranked', score: s }))
    if (session === null) return Promise.resolve(emit(update, { status: 'noSession', score: s }))
    this.pendingScore = { session, score: s }
    return this.send(update)
  }

  /** Retries the last failed score submission (same session, same score). */
  retry(update: (o: OnlineOutcome) => void): Promise<OnlineOutcome> {
    if (!this.pendingScore) return Promise.resolve(emit(update, { status: 'noSession', score: 0 }))
    return this.send(update)
  }

  private async send(update: (o: OnlineOutcome) => void): Promise<OnlineOutcome> {
    const { session, score } = this.pendingScore!
    emit(update, { status: 'pending', score })
    try {
      const r = await this.chain.submitScore(session, score, hash => emit(update, { status: 'mining', score, hash }))
      this.pendingScore = null
      this.cached = null
      return emit(update, { status: 'submitted', score, hash: r.hash, newBest: r.newBest })
    } catch (err) {
      const e = classify(err)
      return emit(update, { status: e.code === 'rejected' ? 'rejected' : 'unavailable', score })
    }
  }

  async list(): Promise<BoardEntry[] | null> {
    try {
      this.cached = await this.chain.leaderboard()
      return this.cached
    } catch {
      return null
    }
  }
}

function emit(update: (o: OnlineOutcome) => void, o: OnlineOutcome): OnlineOutcome {
  update(o)
  return o
}
