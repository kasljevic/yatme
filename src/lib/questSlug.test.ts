import { describe, it, expect } from 'vitest'
import { isValidQuestSlug, parseViewerModeSearch } from './questSlug.ts'

describe('isValidQuestSlug', () => {
  it.each(['thais-quest', 'a', 'quest2', 'rookgaard-basics'])('accepts %s', (slug) => {
    expect(isValidQuestSlug(slug)).toBe(true)
  })

  it.each([
    ['empty string', ''],
    ['uppercase', 'Thais'],
    ['underscore', 'quest_1'],
    ['dot-dot', '../etc'],
    ['forward slash', 'a/b'],
    ['leading hyphen', '-quest'],
    ['too long', 'a'.repeat(101)],
  ])('rejects %s: %s', (_label, slug) => {
    expect(isValidQuestSlug(slug)).toBe(false)
  })

  it.each([123, null, undefined])('rejects non-string input: %s', (slug) => {
    expect(isValidQuestSlug(slug)).toBe(false)
  })
})

describe('parseViewerModeSearch', () => {
  it('defaults to editor mode when viewer is absent (backward compatibility)', () => {
    expect(parseViewerModeSearch('?x=100&y=200&z=7')).toEqual({ mode: 'editor' })
  })

  it('defaults to editor mode for an empty search string', () => {
    expect(parseViewerModeSearch('')).toEqual({ mode: 'editor' })
  })

  it('selects quest mode for a valid viewer=quest + quest slug pair', () => {
    expect(parseViewerModeSearch('?viewer=quest&quest=thais-quest')).toEqual({ mode: 'quest', quest: 'thais-quest' })
  })

  it('fails closed when viewer is anything other than "quest"', () => {
    expect(parseViewerModeSearch('?viewer=editor&quest=thais-quest')).toEqual({
      mode: 'invalid-quest',
      reason: 'Unknown viewer mode.',
    })
    expect(parseViewerModeSearch('?viewer=Quest&quest=thais-quest')).toEqual({
      mode: 'invalid-quest',
      reason: 'Unknown viewer mode.',
    })
  })

  it('fails closed when quest is missing', () => {
    expect(parseViewerModeSearch('?viewer=quest')).toEqual({
      mode: 'invalid-quest',
      reason: 'A valid quest slug is required.',
    })
  })

  it('fails closed when quest is an invalid slug', () => {
    expect(parseViewerModeSearch('?viewer=quest&quest=Thais_Quest')).toEqual({
      mode: 'invalid-quest',
      reason: 'A valid quest slug is required.',
    })
    expect(parseViewerModeSearch('?viewer=quest&quest=../etc')).toEqual({
      mode: 'invalid-quest',
      reason: 'A valid quest slug is required.',
    })
  })

  it('preserves existing x/y/z deep-link params alongside viewer mode parsing (no interference)', () => {
    expect(parseViewerModeSearch('?x=100&y=200&z=7&house=123')).toEqual({ mode: 'editor' })
  })
})
