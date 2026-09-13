import { describe, expect, it } from 'vitest'
import { isMappable, wordToDigits } from '../src/lib/keymap'

describe('wordToDigits', () => {
  it('maps a plain word to its digit sequence', () => {
    expect(wordToDigits('home')).toBe('4663')
  })

  it('maps letters spanning every key', () => {
    expect(wordToDigits('good')).toBe('4663')
  })

  it('maps a digit character to itself (multi-tap trailing stop)', () => {
    expect(wordToDigits('go4')).toBe('464')
  })

  it('maps key-1 symbols to digit 1', () => {
    expect(wordToDigits('a.b')).toBe('212')
  })

  it('maps a mix of letters, symbols, and digits (e.g. an email)', () => {
    expect(wordToDigits('a@b.com')).toBe('2121266')
  })

  it('throws for a character with no keypad mapping', () => {
    expect(() => wordToDigits('café')).toThrow(/no keypad digit/)
  })
})

describe('isMappable', () => {
  it('is true for a plain lowercase word', () => {
    expect(isMappable('hello')).toBe(true)
  })

  it('is true for digits and key-1 symbols', () => {
    expect(isMappable('go4')).toBe(true)
    expect(isMappable('a.b')).toBe(true)
  })

  it('is false for characters with no keypad mapping', () => {
    expect(isMappable('café')).toBe(false)
    expect(isMappable('Hello')).toBe(false)
  })
})
