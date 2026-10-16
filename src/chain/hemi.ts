/**
 * Hemi Network integration: wallet connection, network switching, and the two on-chain
 * transactions of a game session (start + score), plus leaderboard reads.
 * The contract lives in `contracts/HemiWyrmArcade.sol`; its address is in `deployment.json`.
 */
import {
  createPublicClient, createWalletClient, custom, decodeEventLog, defineChain, http, getAddress,
  type Address, type Hash, type PublicClient, type WalletClient,
} from 'viem'
import artifact from './artifact.json'
import deployment from './deployment.json'

export const HEMI_SEPOLIA = defineChain({
  id: 743111,
  name: 'Hemi Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet.rpc.hemi.network/rpc'] } },
  blockExplorers: { default: { name: 'Hemi Explorer', url: 'https://testnet.explorer.hemi.xyz' } },
  testnet: true,
})

export const ABI = artifact.abi as typeof artifact.abi
export const BYTECODE = artifact.bytecode as `0x${string}`
export const CONTRACT: Address | null = deployment.address ? getAddress(deployment.address) : null

export type BoardEntry = { rank: number; address: Address; best: number; last: number; games: number; bestAt: number }
export type BoardStats = { players: number; totalGames: number; sessions: number }

type Eip1193 = { request(args: { method: string; params?: unknown[] | object }): Promise<unknown>; on?(e: string, cb: (...a: unknown[]) => void): void }

export class ChainError extends Error {
  constructor(readonly code: 'no-wallet' | 'rejected' | 'no-contract' | 'reverted' | 'network' | 'funds', message?: string) {
    super(message ?? code)
  }
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
export const explorerTx = (hash: string) => `${HEMI_SEPOLIA.blockExplorers.default.url}/tx/${hash}`
export const explorerAddress = (a: string) => `${HEMI_SEPOLIA.blockExplorers.default.url}/address/${a}`

function provider(): Eip1193 | null {
  return ((window as unknown as { ethereum?: Eip1193 }).ethereum) ?? null
}

/** Normalizes wallet/viem errors into a small set of player-facing reasons. */
export function classify(err: unknown): ChainError {
  if (err instanceof ChainError) return err
  const e = err as { code?: number; name?: string; shortMessage?: string; message?: string; cause?: unknown }
  const text = `${e?.name ?? ''} ${e?.shortMessage ?? ''} ${e?.message ?? ''}`.toLowerCase()
  if (e?.code === 4001 || text.includes('user rejected') || text.includes('user denied') || text.includes('rejected the request')) return new ChainError('rejected')
  if (text.includes('insufficient funds')) return new ChainError('funds')
  if (text.includes('revert')) return new ChainError('reverted', e?.shortMessage)
  return new ChainError('network', e?.shortMessage ?? e?.message)
}

export class HemiChain {
  account: Address | null = null
  readonly publicClient: PublicClient
  private wallet: WalletClient | null = null
  private listeners = new Set<(account: Address | null) => void>()

  constructor() {
    this.publicClient = createPublicClient({ chain: HEMI_SEPOLIA, transport: http() }) as PublicClient
    const eth = provider()
    if (eth?.on) {
      eth.on('accountsChanged', (accs: unknown) => {
        const list = accs as string[]
        this.setAccount(list?.[0] ? getAddress(list[0]) : null)
      })
    }
    // Silent reconnect if the site is already authorized.
    void eth?.request({ method: 'eth_accounts' }).then(accs => {
      const list = accs as string[]
      if (list?.[0]) this.setAccount(getAddress(list[0]))
    }).catch(() => undefined)
  }

  get hasWallet(): boolean {
    return provider() !== null
  }

  get contractReady(): boolean {
    return CONTRACT !== null
  }

  onChange(cb: (account: Address | null) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private setAccount(a: Address | null): void {
    if (a === this.account) return
    this.account = a
    for (const cb of this.listeners) cb(a)
  }

  private walletClient(): WalletClient {
    const eth = provider()
    if (!eth) throw new ChainError('no-wallet')
    if (!this.wallet) this.wallet = createWalletClient({ chain: HEMI_SEPOLIA, transport: custom(eth) })
    return this.wallet
  }

  async connect(): Promise<Address> {
    const eth = provider()
    if (!eth) throw new ChainError('no-wallet')
    try {
      const accs = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
      if (!accs?.[0]) throw new ChainError('rejected')
      const a = getAddress(accs[0])
      this.setAccount(a)
      return a
    } catch (err) {
      throw classify(err)
    }
  }

  /** Makes sure the wallet is on Hemi Sepolia, adding the network if the wallet does not know it. */
  async ensureNetwork(): Promise<void> {
    const eth = provider()
    if (!eth) throw new ChainError('no-wallet')
    const hex = `0x${HEMI_SEPOLIA.id.toString(16)}`
    const current = (await eth.request({ method: 'eth_chainId' })) as string
    if (parseInt(current, 16) === HEMI_SEPOLIA.id) return
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
    } catch (err) {
      const code = (err as { code?: number; data?: { originalError?: { code?: number } } })?.code
      const inner = (err as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code
      if (code !== 4902 && inner !== 4902) throw classify(err)
      try {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: hex, chainName: HEMI_SEPOLIA.name, nativeCurrency: HEMI_SEPOLIA.nativeCurrency,
            rpcUrls: HEMI_SEPOLIA.rpcUrls.default.http, blockExplorerUrls: [HEMI_SEPOLIA.blockExplorers.default.url],
          }],
        })
      } catch (addErr) {
        throw classify(addErr)
      }
    }
  }

  private async prepare(): Promise<Address> {
    if (!CONTRACT) throw new ChainError('no-contract')
    const account = this.account ?? (await this.connect())
    await this.ensureNetwork()
    return account
  }

  /** Session transaction #1. Resolves once mined with the on-chain session id. */
  async startSession(onSent?: (hash: Hash) => void): Promise<{ sessionId: bigint; hash: Hash }> {
    const account = await this.prepare()
    try {
      const hash = await this.walletClient().writeContract({ address: CONTRACT!, abi: ABI, functionName: 'startSession', account, chain: HEMI_SEPOLIA })
      onSent?.(hash)
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new ChainError('reverted')
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== CONTRACT!.toLowerCase()) continue
        try {
          const ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics })
          if (ev.eventName === 'SessionStarted') return { sessionId: (ev.args as unknown as { sessionId: bigint }).sessionId, hash }
        } catch { /* other event */ }
      }
      throw new ChainError('reverted', 'SessionStarted event missing')
    } catch (err) {
      throw classify(err)
    }
  }

  /** Session transaction #2: records the score of the open session. */
  async submitScore(sessionId: bigint, score: number, onSent?: (hash: Hash) => void): Promise<{ hash: Hash; newBest: boolean }> {
    const account = await this.prepare()
    try {
      const hash = await this.walletClient().writeContract({
        address: CONTRACT!, abi: ABI, functionName: 'submitScore', args: [sessionId, BigInt(Math.max(0, Math.floor(score)))], account, chain: HEMI_SEPOLIA,
      })
      onSent?.(hash)
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new ChainError('reverted')
      let newBest = false
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: ABI, data: log.data, topics: log.topics })
          if (ev.eventName === 'ScoreSubmitted') newBest = (ev.args as unknown as { newBest: boolean }).newBest
        } catch { /* other event */ }
      }
      return { hash, newBest }
    } catch (err) {
      throw classify(err)
    }
  }

  async stats(): Promise<BoardStats> {
    if (!CONTRACT) throw new ChainError('no-contract')
    const [players, totalGames, sessions] = await Promise.all(
      (['playerCount', 'totalGames', 'sessionCount'] as const).map(fn => this.publicClient.readContract({ address: CONTRACT!, abi: ABI, functionName: fn }) as Promise<bigint>),
    )
    return { players: Number(players), totalGames: Number(totalGames), sessions: Number(sessions) }
  }

  /** Full leaderboard sorted by best score (players with no finished game are skipped). */
  async leaderboard(): Promise<BoardEntry[]> {
    if (!CONTRACT) throw new ChainError('no-contract')
    const count = Number(await this.publicClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'playerCount' }) as bigint)
    const PAGE = 250
    const rows: Omit<BoardEntry, 'rank'>[] = []
    for (let offset = 0; offset < count; offset += PAGE) {
      const [addrs, best, last, games, bestAt] = await this.publicClient.readContract({
        address: CONTRACT, abi: ABI, functionName: 'getPlayers', args: [BigInt(offset), BigInt(PAGE)],
      }) as [Address[], bigint[], bigint[], number[], bigint[]]
      addrs.forEach((a, i) => {
        if (Number(games[i]) === 0) return
        rows.push({ address: a, best: Number(best[i]), last: Number(last[i]), games: Number(games[i]), bestAt: Number(bestAt[i]) })
      })
    }
    rows.sort((a, b) => b.best - a.best || a.bestAt - b.bestAt)
    return rows.map((r, i) => ({ ...r, rank: i + 1 }))
  }

  /** Deploys a fresh contract from the connected wallet (used when no deployment is configured). */
  async deploy(): Promise<{ address: Address; hash: Hash }> {
    const account = this.account ?? (await this.connect())
    await this.ensureNetwork()
    try {
      const hash = await this.walletClient().deployContract({ abi: ABI, bytecode: BYTECODE, account, chain: HEMI_SEPOLIA })
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash })
      if (!receipt.contractAddress) throw new ChainError('reverted')
      return { address: getAddress(receipt.contractAddress), hash }
    } catch (err) {
      throw classify(err)
    }
  }
}
