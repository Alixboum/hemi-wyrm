import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import fr from '../src/i18n/fr.json'
import { detectLocale, resolveLocale } from '../src/engine/i18n'

describe('i18n', () => {
  it('defaults to French', () => {
    expect(detectLocale(['fr-FR'])).toBe('fr')
    expect(detectLocale(['en-US', 'fr'])).toBe('fr')
    expect(detectLocale(undefined)).toBe('fr')
  })
  it('lets a saved choice win over detection', () => {
    expect(resolveLocale('en', ['fr-FR'])).toBe('en')
    expect(resolveLocale('fr', ['en-US'])).toBe('fr')
    expect(resolveLocale('', ['en-US'])).toBe('fr')
  })
  it('has the same keys and placeholders in both languages', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort())
    const vars = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const [key, value] of Object.entries(fr)) expect(vars((en as Record<string, string>)[key]), key).toEqual(vars(value))
  })
})
