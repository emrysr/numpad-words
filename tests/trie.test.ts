import { describe, expect, it } from 'vitest'
import { bestCompletion, buildTrie, insertWord, lookup } from '../src/lib/trie'

describe('buildTrie + lookup', () => {
  it('finds an exact match for a single word', () => {
    const trie = buildTrie([{ word: 'home', freq: 10 }])
    expect(lookup(trie, '4663')).toEqual([{ word: 'home', freq: 10 }])
  })

  it('ranks same-digit words by frequency, descending', () => {
    const trie = buildTrie([
      { word: 'good', freq: 5 },
      { word: 'home', freq: 20 },
    ])
    expect(lookup(trie, '4663').map((e) => e.word)).toEqual(['home', 'good'])
  })

  it('returns an empty list for a digit sequence nothing matches', () => {
    const trie = buildTrie([{ word: 'home', freq: 10 }])
    expect(lookup(trie, '9999')).toEqual([])
  })
})

describe('bestCompletion', () => {
  it('predicts a longer word from a short prefix', () => {
    const trie = buildTrie([
      { word: 'so', freq: 100 },
      { word: 'something', freq: 50 },
    ])
    // "so" -> "76", a prefix of "something" -> "76638...".
    expect(bestCompletion(trie, '76')?.word).toBe('so')
    expect(bestCompletion(trie, '766')?.word).toBe('something')
  })

  it('returns null when no word continues from the prefix', () => {
    const trie = buildTrie([{ word: 'home', freq: 10 }])
    expect(bestCompletion(trie, '9')).toBeNull()
  })

  it('prefers the highest-frequency word anywhere in the subtree, not just the exact node', () => {
    const trie = buildTrie([
      { word: 'good', freq: 5 },
      { word: 'goodbye', freq: 500 },
    ])
    expect(bestCompletion(trie, '4663')?.word).toBe('goodbye')
  })
})

describe('insertWord', () => {
  it('makes a brand-new word reachable via lookup', () => {
    const trie = buildTrie([])
    insertWord(trie, { word: 'zog', freq: 1_000_000 })
    expect(lookup(trie, '964').map((e) => e.word)).toContain('zog')
  })

  it('promotes an existing lower-ranked word to the front rather than duplicating it', () => {
    const trie = buildTrie([
      { word: 'woh', freq: 306 },
      { word: 'zog', freq: 101 },
    ])
    insertWord(trie, { word: 'zog', freq: 1_000_000 })
    const results = lookup(trie, '964')
    expect(results.filter((e) => e.word === 'zog')).toHaveLength(1)
    expect(results[0].word).toBe('zog')
  })

  it('updates ancestor "best" completions so the new word is predicted from a short prefix', () => {
    const trie = buildTrie([{ word: 'so', freq: 100 }])
    insertWord(trie, { word: 'something', freq: 1_000_000 })
    expect(bestCompletion(trie, '7')?.word).toBe('something')
  })
})
