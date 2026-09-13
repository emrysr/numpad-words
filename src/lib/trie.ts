import { wordToDigits } from './keymap'

export interface TrieEntry {
  word: string
  freq: number
}

export interface TrieNode {
  children?: Record<string, TrieNode>
  /** Words whose digit sequence ends exactly here, sorted by freq descending. */
  words?: TrieEntry[]
  /** Highest-frequency word reachable from here (itself or any descendant) -
   * lets a longer word be predicted before its digit sequence is fully typed. */
  best?: TrieEntry
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
  computeBestCompletions(root)
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

/** Post-order: each node's best is the highest-freq word among its own
 * (already-sorted) entries and its children's bests. */
function computeBestCompletions(node: TrieNode): TrieEntry | undefined {
  let best = node.words?.[0]
  if (node.children) {
    for (const child of Object.values(node.children)) {
      const childBest = computeBestCompletions(child)
      if (childBest && (!best || childBest.freq > best.freq)) best = childBest
    }
  }
  node.best = best
  return best
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

/** Returns the highest-frequency word reachable by continuing to type from
 * this digit prefix (exact match or longer), or `null` if none exists. */
export function bestCompletion(root: TrieNode, digits: string): TrieEntry | null {
  let node = root
  for (const digit of digits) {
    const next = node.children?.[digit]
    if (!next) return null
    node = next
  }
  return node.best ?? null
}

/** Merges one word into an existing trie, e.g. one learned from user input.
 * Placed ahead of any built-in matches for the same digit sequence. */
export function insertWord(root: TrieNode, entry: TrieEntry): void {
  const digits = wordToDigits(entry.word)
  const path = [root]
  let node = root
  for (const digit of digits) {
    node.children ??= {}
    node.children[digit] ??= {}
    node = node.children[digit]
    path.push(node)
  }
  // Drop any existing entry for this word (built-in or previously inserted) so
  // it's always promoted to the front rather than left at its old rank.
  node.words = (node.words ?? []).filter((existing) => existing.word !== entry.word)
  node.words.unshift(entry)

  // Keep every ancestor's cached "best" completion in sync with the new entry.
  for (const ancestor of path) {
    if (!ancestor.best || entry.freq > ancestor.best.freq) ancestor.best = entry
  }
}
