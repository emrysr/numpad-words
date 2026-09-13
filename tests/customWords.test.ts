import { beforeEach, describe, expect, it } from 'vitest'
import { loadCustomWords, saveCustomWord, type KeyValueStore } from '../src/lib/customWords'

const STORAGE_KEY = 'numpad-words:custom-words'

beforeEach(() => {
  localStorage.clear()
})

describe('loadCustomWords', () => {
  it('returns an empty list when nothing has been saved', () => {
    expect(loadCustomWords()).toEqual([])
  })

  it('returns an empty list for corrupted storage instead of throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not valid json')
    expect(loadCustomWords()).toEqual([])
  })
})

describe('saveCustomWord', () => {
  it('persists a word so it round-trips through loadCustomWords', () => {
    saveCustomWord('zog')
    expect(loadCustomWords()).toEqual(['zog'])
  })

  it('accumulates multiple distinct words', () => {
    saveCustomWord('zog')
    saveCustomWord('woh')
    expect(loadCustomWords()).toEqual(['zog', 'woh'])
  })

  it('does not duplicate a word that was already saved', () => {
    saveCustomWord('zog')
    saveCustomWord('zog')
    expect(loadCustomWords()).toEqual(['zog'])
  })
})

describe('custom storage backend', () => {
  function memoryStore(): KeyValueStore {
    const map = new Map<string, string>()
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
    }
  }

  it('works against any KeyValueStore, not just localStorage (e.g. the TUI)', () => {
    const store = memoryStore()
    saveCustomWord('zog', store)
    expect(loadCustomWords(store)).toEqual(['zog'])
    expect(loadCustomWords()).toEqual([]) // browser localStorage is untouched
  })
})
