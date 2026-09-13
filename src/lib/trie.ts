import { wordToDigits } from './keymap'

export interface TrieEntry {
  word: string
  freq: number
}

export interface TrieNode {
  children?: Record<string, TrieNode>
  /** Words whose digit sequence ends exactly here, sorted by freq descending. */
  words?: TrieEntry[]
}

/** Builds a digit-keyed trie from frequency-ranked word entries. */
export function buildTrie(entries: TrieEntry[]): TrieNode {
  const root: TrieNode = {}

  for (const entry of entries) {
    const digits = wordToDigits(entry.word)
    let node = root
    for (const digit of digits) {
      node.children ??= {}
      node.children[digit] ??= {}
      node = node.children[digit]
    }
    node.words ??= []
    node.words.push(entry)
  }

  sortEntriesByFreqDesc(root)
  return root
}

function sortEntriesByFreqDesc(node: TrieNode): void {
  node.words?.sort((a, b) => b.freq - a.freq)
  if (node.children) {
    for (const child of Object.values(node.children)) {
      sortEntriesByFreqDesc(child)
    }
  }
}

/** Returns the frequency-ranked candidates for an exact digit sequence, or `[]` if none match. */
export function lookup(root: TrieNode, digits: string): TrieEntry[] {
  let node = root
  for (const digit of digits) {
    const next = node.children?.[digit]
    if (!next) return []
    node = next
  }
  return node.words ?? []
}
