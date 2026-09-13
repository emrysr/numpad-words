/**
 * Build-time step: SUBTLEX-UK frequency list -> digit-keyed trie -> JSON.
 *
 * Usage: npm run build:trie
 *
 * Expects the raw corpus at data/raw/SUBTLEX-UK.txt (tab-delimited, from
 * https://psychology.nottingham.ac.uk/subtlex-uk/, not checked into git).
 * Writes the compact runtime trie to public/trie.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMappable } from '../src/lib/keymap'
import { buildTrie, type TrieEntry } from '../src/lib/trie'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const RAW_PATH = resolve(ROOT, 'data/raw/SUBTLEX-UK.txt')
const OUT_PATH = resolve(ROOT, 'public/trie.json')

/** Covers >95% of everyday text; going further mostly adds rare words and collisions. */
const VOCAB_SIZE = 50_000

function loadEntries(path: string): TrieEntry[] {
  const lines = readFileSync(path, 'utf-8').split('\n')
  const header = lines[0].split('\t')
  const wordCol = header.indexOf('Spelling')
  const freqCol = header.indexOf('FreqCount')
  if (wordCol === -1 || freqCol === -1) {
    throw new Error('expected "Spelling" and "FreqCount" columns in SUBTLEX-UK.txt')
  }

  const entries: TrieEntry[] = []
  for (const line of lines.slice(1)) {
    if (!line) continue
    const cols = line.split('\t')
    const word = cols[wordCol]?.toLowerCase()
    const freq = Number(cols[freqCol])
    if (!word || !isMappable(word) || !Number.isFinite(freq) || freq <= 0) continue
    entries.push({ word, freq })
  }
  return entries
}

function main(): void {
  const entries = loadEntries(RAW_PATH)
  entries.sort((a, b) => b.freq - a.freq)
  const vocab = entries.slice(0, VOCAB_SIZE)

  const trie = buildTrie(vocab)
  const json = JSON.stringify(trie)
  writeFileSync(OUT_PATH, json)

  console.log(`read ${entries.length} candidate words from corpus`)
  console.log(`kept top ${vocab.length} by frequency`)
  console.log(`wrote ${OUT_PATH} (${(json.length / 1024 / 1024).toFixed(2)} MB)`)
}

main()
