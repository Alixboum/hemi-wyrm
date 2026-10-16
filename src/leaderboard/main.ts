/**
 * Standalone on-chain leaderboard page. Reads every player's best score from the
 * HemiWyrmArcade contract on the active Hemi network and ranks them by 0x address.
 */
import './style.css'
import { CONTRACT, NETWORK_LABEL, explorerAddress, HemiChain, shortAddress, type BoardEntry, type BoardStats } from '../chain/hemi'
import { hemiMarkSvg } from './mark'
import favicon from '../../assets/share/favicon.png'

const icon = document.createElement('link')
icon.rel = 'icon'
icon.type = 'image/png'
icon.href = favicon
document.head.appendChild(icon)

type Lang = 'fr' | 'en'
const SAVE_KEY = 'hemiwyrm.save'

const TEXT: Record<Lang, Record<string, string>> = {
  fr: {
    title: 'Leaderboard on-chain', sub: 'Les meilleurs scores enregistrés sur Hemi Network, adresse par adresse.',
    play: 'Jouer', connect: 'Connecter le wallet', refresh: 'Actualiser', search: 'Rechercher une adresse 0x…',
    players: 'Joueurs', games: 'Parties enregistrées', sessions: 'Sessions ouvertes', contract: 'Contrat',
    rank: '#', address: 'Adresse', best: 'Meilleur score', played: 'Parties', last: 'Dernier score', date: 'Record le',
    loading: 'Lecture du contrat sur Hemi…', empty: 'Aucun score on-chain pour l\u2019instant — lance une partie et sois le premier !',
    error: 'Impossible de lire le contrat Hemi pour le moment. Réessaie dans un instant.', noContract: 'Le contrat du jeu n\u2019est pas encore déployé.',
    you: 'toi', yourRank: 'Ton rang : #{rank} · meilleur score {n}', notRanked: 'Ton adresse n\u2019a pas encore de score enregistré.',
    updated: 'Mis à jour à {t}', noMatch: 'Aucune adresse ne correspond.', network: NETWORK_LABEL,
  },
  en: {
    title: 'On-chain leaderboard', sub: 'The best scores recorded on Hemi Network, address by address.',
    play: 'Play', connect: 'Connect wallet', refresh: 'Refresh', search: 'Search a 0x address…',
    players: 'Players', games: 'Recorded games', sessions: 'Opened sessions', contract: 'Contract',
    rank: '#', address: 'Address', best: 'Best score', played: 'Games', last: 'Last score', date: 'Record on',
    loading: 'Reading the contract on Hemi…', empty: 'No on-chain scores yet — start a game and be the first!',
    error: 'Could not read the Hemi contract right now. Try again in a moment.', noContract: 'The game contract is not deployed yet.',
    you: 'you', yourRank: 'Your rank: #{rank} · best score {n}', notRanked: 'Your address has no recorded score yet.',
    updated: 'Updated at {t}', noMatch: 'No address matches.', network: NETWORK_LABEL,
  },
}

function readLang(): Lang {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as { locale?: string }
    if (d.locale === 'fr' || d.locale === 'en') return d.locale
  } catch { /* ignore */ }
  return 'fr'
}

function writeLang(l: Lang): void {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Record<string, unknown>
    d.locale = l
    if (d.version === undefined) d.version = 1
    localStorage.setItem(SAVE_KEY, JSON.stringify(d))
  } catch { /* ignore */ }
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const chain = new HemiChain()
let lang = readLang()
let rows: BoardEntry[] | null = null
let stats: BoardStats | null = null
let state: 'loading' | 'ready' | 'error' | 'missing' = CONTRACT ? 'loading' : 'missing'
let filter = ''
let updatedAt: Date | null = null

const t = (k: string, v: Record<string, string | number> = {}) => TEXT[lang][k].replace(/\{(\w+)\}/g, (_, n: string) => String(v[n] ?? ''))
const num = (n: number) => n.toLocaleString(lang)
const app = document.getElementById('app')!

function shell(): void {
  document.documentElement.lang = lang
  app.innerHTML = `
    <header class="top">
      <a class="brand" href="./index.html">${hemiMarkSvg()}<span>HEMI <b>WYRM</b></span></a>
      <div class="top-actions">
        <div class="lang">${(['fr', 'en'] as Lang[]).map(l => `<button data-lang="${l}" class="${l === lang ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>
        <button class="wallet" data-act="connect"></button>
        <a class="play" href="./index.html">${esc(t('play'))}</a>
      </div>
    </header>
    <main>
      <section class="hero">
        <p class="net">${esc(t('network'))}</p>
        <h1>${esc(t('title'))}</h1>
        <p class="sub">${esc(t('sub'))}</p>
      </section>
      <section class="stats" data-bind="stats"></section>
      <section class="me" data-bind="me"></section>
      <section class="board-wrap">
        <div class="tools">
          <input type="search" data-bind="search" placeholder="${esc(t('search'))}" spellcheck="false" autocomplete="off" />
          <button data-act="refresh">${esc(t('refresh'))}</button>
          <span class="updated" data-bind="updated"></span>
        </div>
        <div data-bind="board"></div>
      </section>
    </main>
    <footer class="foot">${CONTRACT ? `${esc(t('contract'))} <a href="${explorerAddress(CONTRACT)}" target="_blank" rel="noopener">${esc(CONTRACT)}</a>` : ''}</footer>`
  const search = app.querySelector<HTMLInputElement>('[data-bind="search"]')!
  search.value = filter
  search.addEventListener('input', () => {
    filter = search.value.trim().toLowerCase()
    renderBoard()
  })
  renderAll()
}

function renderAll(): void {
  renderWallet()
  renderStats()
  renderMe()
  renderBoard()
}

function renderWallet(): void {
  const el = app.querySelector<HTMLElement>('[data-act="connect"]')!
  const a = chain.account
  el.classList.toggle('on', !!a)
  el.innerHTML = a ? `<i></i>${esc(shortAddress(a))}` : esc(t('connect'))
}

function renderStats(): void {
  const el = app.querySelector<HTMLElement>('[data-bind="stats"]')!
  const card = (label: string, value: string) => `<div class="stat"><small>${esc(label)}</small><b>${value}</b></div>`
  el.innerHTML = stats
    ? card(t('players'), num(rows?.length ?? stats.players)) + card(t('games'), num(stats.totalGames)) + card(t('sessions'), num(stats.sessions))
    : ''
  const up = app.querySelector<HTMLElement>('[data-bind="updated"]')!
  up.textContent = updatedAt ? t('updated', { t: updatedAt.toLocaleTimeString(lang) }) : ''
}

function renderMe(): void {
  const el = app.querySelector<HTMLElement>('[data-bind="me"]')!
  const a = chain.account?.toLowerCase()
  if (!a || !rows) {
    el.innerHTML = ''
    return
  }
  const mine = rows.find(r => r.address.toLowerCase() === a)
  el.innerHTML = `<p>${hemiMarkSvg()}<span>${esc(mine ? t('yourRank', { rank: mine.rank, n: num(mine.best) }) : t('notRanked'))}</span></p>`
}

function renderBoard(): void {
  const el = app.querySelector<HTMLElement>('[data-bind="board"]')!
  if (state === 'missing') return void (el.innerHTML = `<p class="empty">${esc(t('noContract'))}</p>`)
  if (state === 'loading' && !rows) return void (el.innerHTML = `<p class="empty"><i class="spin"></i>${esc(t('loading'))}</p>`)
  if (state === 'error' && !rows) return void (el.innerHTML = `<p class="empty err">${esc(t('error'))}</p>`)
  if (!rows?.length) return void (el.innerHTML = `<p class="empty">${esc(t('empty'))}</p>`)
  const me = chain.account?.toLowerCase()
  const list = filter ? rows.filter(r => r.address.toLowerCase().includes(filter)) : rows
  if (!list.length) return void (el.innerHTML = `<p class="empty">${esc(t('noMatch'))}</p>`)
  const body = list.map(r => {
    const isMe = r.address.toLowerCase() === me
    const date = r.bestAt ? new Date(r.bestAt * 1000).toLocaleDateString(lang, { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
    return `<tr class="${r.rank <= 3 ? `podium p${r.rank}` : ''} ${isMe ? 'mine' : ''}">
      <td class="rank"><span>${r.rank}</span></td>
      <td class="addr"><a href="${explorerAddress(r.address)}" target="_blank" rel="noopener"><span class="full">${esc(r.address)}</span><span class="short">${esc(shortAddress(r.address))}</span></a>${isMe ? `<em>${esc(t('you'))}</em>` : ''}</td>
      <td class="best">${num(r.best)}</td>
      <td class="num">${num(r.games)}</td>
      <td class="num hide-s">${num(r.last)}</td>
      <td class="date hide-s">${esc(date)}</td>
    </tr>`
  }).join('')
  el.innerHTML = `<table><thead><tr><th>${esc(t('rank'))}</th><th>${esc(t('address'))}</th><th>${esc(t('best'))}</th><th>${esc(t('played'))}</th><th class="hide-s">${esc(t('last'))}</th><th class="hide-s">${esc(t('date'))}</th></tr></thead><tbody>${body}</tbody></table>`
}

let loading = false
async function load(): Promise<void> {
  if (!CONTRACT || loading) return
  loading = true
  if (!rows) state = 'loading'
  renderBoard()
  try {
    const [board, s] = await Promise.all([chain.leaderboard(), chain.stats()])
    rows = board
    stats = s
    state = 'ready'
    updatedAt = new Date()
  } catch {
    state = 'error'
  }
  loading = false
  renderAll()
}

app.addEventListener('click', e => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-lang]')
  if (!el) return
  if (el.dataset.lang) {
    lang = el.dataset.lang as Lang
    writeLang(lang)
    shell()
    return
  }
  if (el.dataset.act === 'refresh') void load()
  if (el.dataset.act === 'connect' && !chain.account) void chain.connect().catch(() => undefined)
})

chain.onChange(() => renderAll())
shell()
void load()
window.setInterval(() => {
  if (!document.hidden) void load()
}, 30_000)
