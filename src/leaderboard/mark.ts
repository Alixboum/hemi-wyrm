/** Hemi Network mark (disc split by a tapered cut) as inline SVG, for pages without the game UI. */
let markId = 0
export function hemiMarkSvg(cls = 'hemi-mark'): string {
  const id = `lbm${++markId}`
  return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><mask id="${id}"><rect width="100" height="100" fill="#fff"/><path d="M41 -1H59L53 37H47Z M41 101H59L53 63H47Z" fill="#000"/></mask></defs><circle cx="50" cy="50" r="50" fill="#FF4600" mask="url(#${id})"/></svg>`
}
