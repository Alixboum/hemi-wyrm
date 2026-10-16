// Fails the build when the shipped bundle grows past the budget, so starter projects stay fast
// to load on mobile networks. JS/CSS are measured gzipped (what the CDN sends); fonts are already
// compressed woff2 and budgeted separately because CJK coverage is large.
//
// `total` is a finite guard on everything shipped in dist, not the initial download: Space Worm's
// staged loader (src/engine/assets.ts) blocks the title only on stage 0 (icons + UI clicks, ~0.1 MB)
// and streams textures, SFX and music (stages 1-3) afterwards. The old 4.4 MB starter figure predates
// that streamed media. 12 MB leaves headroom over the current 8.6 MB checked here (10.4 MB after the
// sharing step adds OG/favicon art to dist/share) while still failing on real bloat.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const MB = 1024 * 1024
const BUDGET = { js: 2.0 * MB, fonts: 2.2 * MB, total: 12 * MB }
const walk = dir => readdirSync(dir).flatMap(name => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const files = walk('dist').map(path => {
  const raw = readFileSync(path)
  const text = /\.(js|css|html|json|svg)$/.test(path)
  return { path, size: raw.length, wire: text ? gzipSync(raw).length : raw.length }
})
const sum = pred => files.filter(pred).reduce((n, f) => n + f.wire, 0)
const js = sum(f => f.path.endsWith('.js'))
const fonts = sum(f => f.path.endsWith('.woff2'))
const total = sum(f => !f.path.endsWith('.txt'))
const media = sum(f => /\.(mp3|ogg|wav|webp|png|jpe?g)$/.test(f.path))
const mb = n => `${(n / MB).toFixed(2)} MB`
console.log(`bundle (gzip): js ${mb(js)} / fonts ${mb(fonts)} / media (streamed) ${mb(media)} / total ${mb(total)}`)
const over = Object.entries({ js, fonts, total }).filter(([k, v]) => v > BUDGET[k])
if (over.length) {
  for (const [k, v] of over) console.error(`over budget: ${k} ${mb(v)} > ${mb(BUDGET[k])}`)
  process.exit(1)
}
