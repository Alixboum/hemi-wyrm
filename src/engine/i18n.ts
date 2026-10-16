import en from '../i18n/en.json'
import fr from '../i18n/fr.json'
import type { Locale } from './save'

export type Dictionary = Record<string, string>

/**
 * Hemi Wyrm ships in French (default) and English. The player switches with the FR | EN toggle
 * on the title screen or in Settings; a saved choice always wins.
 */
const DICTIONARIES: Record<Locale, Dictionary> = { fr, en }

/** French is the default language whatever the browser says; English is opt-in via the toggle. */
export function detectLocale(_languages: readonly string[] | undefined): Locale {
  return 'fr'
}

/** A saved player choice always wins over browser detection. */
export function resolveLocale(saved: Locale | '', languages: readonly string[] | undefined): Locale {
  return saved === 'fr' || saved === 'en' ? saved : detectLocale(languages)
}

export class I18n {
  locale: Locale
  private listeners = new Set<(locale: Locale) => void>()
  constructor(locale: Locale) {
    this.locale = locale
    document.documentElement.lang = locale
  }
  /** Look up `key`, replacing `{name}` placeholders. Missing keys render the key so gaps are visible. */
  t(key: string, vars: Record<string, string | number> = {}): string {
    const text = DICTIONARIES[this.locale][key] ?? DICTIONARIES.fr[key] ?? key
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
  }

  has(key: string): boolean {
    return key in DICTIONARIES.fr
  }

  /** Locale-aware number formatting. */
  n(value: number): string {
    return Math.floor(value).toLocaleString(this.locale)
  }

  set(locale: Locale): void {
    if (locale === this.locale) return
    this.locale = locale
    document.documentElement.lang = locale
    for (const fn of this.listeners) fn(locale)
  }

  onChange(fn: (locale: Locale) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
export const DICTIONARY_KEYS = { fr: Object.keys(fr), en: Object.keys(en) }
