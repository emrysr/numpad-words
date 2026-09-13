/**
 * Terminal harness for the trie: press numpad digits, see ranked candidates.
 *
 * Usage: npm run tui
 *
 * Mirrors the web app's model (WordSlot list, manual multi-tap mode, custom
 * word learning, completion prediction, stable alternatives) so this is a
 * genuine testbed for the same UX, not just the trie lookup.
 *
 * 2-9      add a digit (or cycle a letter/symbol, in manual mode)
 * 0/space  accept the guess and start a new word (or save + exit manual mode)
 * tab      cycle to the next candidate, or accept a predicted completion
 * bksp     delete a digit, then the previous word once empty
 * m        toggle manual multi-tap spelling mode
 * ctrl+u   reset - clear everything typed so far
 * esc/q    quit
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emitKeypressEvents } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { DIGIT_LETTERS, KEY_1_SYMBOLS, isMappable, wordToDigits } from '../src/lib/keymap'
import type { KeyValueStore } from '../src/lib/customWords'
import { loadCustomWords, saveCustomWord } from '../src/lib/customWords'
import { bestCompletion, insertWord, lookup, type TrieEntry, type TrieNode } from '../src/lib/trie'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TRIE_PATH = resolve(ROOT, 'public/trie.json')
const CUSTOM_WORDS_PATH = resolve(ROOT, 'data/tui-custom-words.json')

const MAX_ALTERNATIVES = 4
const MULTI_TAP_TIMEOUT_MS = 900
const CUSTOM_WORD_FREQ = 1_000_000

/** JSON-file-backed KeyValueStore, standing in for the browser's localStorage. */
const fileStore: KeyValueStore = {
  getItem(key) {
    if (!existsSync(CUSTOM_WORDS_PATH)) return null
    const data = JSON.parse(readFileSync(CUSTOM_WORDS_PATH, 'utf-8'))
    return key in data ? JSON.stringify(data[key]) : null
  },
  setItem(key, value) {
    mkdirSync(dirname(CUSTOM_WORDS_PATH), { recursive: true })
    const data = existsSync(CUSTOM_WORDS_PATH)
      ? JSON.parse(readFileSync(CUSTOM_WORDS_PATH, 'utf-8'))
      : {}
    data[key] = JSON.parse(value)
    writeFileSync(CUSTOM_WORDS_PATH, JSON.stringify(data))
  },
}

const trie: TrieNode = JSON.parse(readFileSync(TRIE_PATH, 'utf-8'))
for (const word of loadCustomWords(fileStore)) {
  if (isMappable(word)) insertWord(trie, { word, freq: CUSTOM_WORD_FREQ })
}

/** good/home share 4663 - a built-in demo of the ranking collision. */
const SAMPLE_WORDS = ['good', 'home', 'hello']
const SAMPLE_HINT = SAMPLE_WORDS.map((word) => `${word} ${wordToDigits(word)}`).join('   ')

interface WordSlot {
  digits: string
  cycleIndex: number
  literal?: boolean
}

let wordInProgress = true
let words: WordSlot[] = [{ digits: '', cycleIndex: 0 }]
const activeWord = () => words[words.length - 1]

let manualMode = false
let manualWord = ''
let manualDigit: string | null = null
let manualIndex = 0
let manualCommitTimer: ReturnType<typeof setTimeout> | undefined

function manualCharsFor(digit: string): string {
  return (digit === '1' ? KEY_1_SYMBOLS : DIGIT_LETTERS[digit]) + digit
}

function candidatesFor(digits: string): TrieEntry[] {
  return digits ? lookup(trie, digits) : []
}

function selectedIndexFor(list: TrieEntry[], cycleIndex: number): number {
  const length = list.length
  return length ? ((cycleIndex % length) + length) % length : -1
}

function resolveWord(slot: WordSlot): string {
  if (slot.literal) return slot.digits
  if (!slot.digits) return ''
  const list = candidatesFor(slot.digits)
  const index = selectedIndexFor(list, slot.cycleIndex)
  return index >= 0 ? list[index].word : `[${slot.digits}]`
}

function priorText(): string {
  return words
    .slice(0, -1)
    .map(resolveWord)
    .filter(Boolean)
    .join(' ')
}

function candidates(): TrieEntry[] {
  return manualMode || activeWord().literal ? [] : candidatesFor(activeWord().digits)
}

function completion(): TrieEntry | null {
  if (manualMode || activeWord().literal) return null
  if (candidates().length > 0) return null
  if (!activeWord().digits) return null
  return bestCompletion(trie, activeWord().digits)
}

function guessLabel(): string {
  if (manualMode) {
    const pending = manualDigit ? manualCharsFor(manualDigit)[manualIndex] : ''
    return manualWord + pending
  }
  const list = candidates()
  const index = selectedIndexFor(list, activeWord().cycleIndex)
  const guess = index >= 0 ? list[index] : null
  return guess?.word ?? completion()?.word ?? activeWord().digits
}

/** Fixed top-(N+1) candidates in stable order; the active one is marked
 * rather than excluded, so the list never reflows/jumps while cycling. */
function alternativeSlots(): { word: string; active: boolean }[] {
  const list = candidates()
  const selected = selectedIndexFor(list, activeWord().cycleIndex)
  return list.slice(0, MAX_ALTERNATIVES + 1).map((entry, index) => ({
    word: entry.word,
    active: index === selected,
  }))
}

function pressDigit(digit: string): void {
  const last = activeWord()
  if (last.literal || (!wordInProgress && last.digits)) {
    words.push({ digits: digit, cycleIndex: 0 })
  } else {
    last.digits += digit
    last.cycleIndex = 0
  }
  wordInProgress = true
}

function cycleNext(): void {
  activeWord().cycleIndex++
}

function promoteCompletion(): void {
  const found = completion()
  if (!found) return
  const last = activeWord()
  last.digits = found.word
  last.cycleIndex = 0
  last.literal = true
}

function acceptCompletion(): void {
  if (!completion()) return
  promoteCompletion()
  words.push({ digits: '', cycleIndex: 0 })
  wordInProgress = false
}

function nextOrAcceptCompletion(): void {
  if (completion()) acceptCompletion()
  else cycleNext()
}

function accept(): void {
  wordInProgress = false
}

function backspace(): void {
  if (manualMode) {
    if (manualDigit) {
      clearTimeout(manualCommitTimer)
      manualDigit = null
      manualIndex = 0
      return
    }
    if (manualWord) {
      manualWord = manualWord.slice(0, -1)
      return
    }
  }

  const last = activeWord()
  if (last.digits) {
    last.digits = last.digits.slice(0, -1)
    last.cycleIndex = 0
    wordInProgress = true
  } else if (words.length > 1) {
    words.pop()
    wordInProgress = true
  }
}

function resetAll(): void {
  words = [{ digits: '', cycleIndex: 0 }]
  wordInProgress = true
  clearTimeout(manualCommitTimer)
  manualWord = ''
  manualDigit = null
  manualIndex = 0
}

function commitManualLetter(): void {
  clearTimeout(manualCommitTimer)
  if (!manualDigit) return
  manualWord += manualCharsFor(manualDigit)[manualIndex]
  manualDigit = null
  manualIndex = 0
}

function cycleManualLetter(digit: string): void {
  if (manualDigit === digit) {
    manualIndex = (manualIndex + 1) % manualCharsFor(digit).length
  } else {
    commitManualLetter()
    manualDigit = digit
    manualIndex = 0
  }
  clearTimeout(manualCommitTimer)
  // Unlike the Vue app, nothing re-renders this automatically when the timer
  // fires on its own (not in response to a keypress), so trigger it here.
  manualCommitTimer = setTimeout(() => {
    commitManualLetter()
    render()
  }, MULTI_TAP_TIMEOUT_MS)
}

function saveManualWord(): void {
  commitManualLetter()
  const word = manualWord
  if (word) {
    words.push({ digits: word, cycleIndex: 0, literal: true })
    words.push({ digits: '', cycleIndex: 0 })
    if (isMappable(word)) {
      saveCustomWord(word, fileStore)
      insertWord(trie, { word, freq: CUSTOM_WORD_FREQ })
    }
  }
  manualWord = ''
  manualMode = false
}

function toggleManualMode(): void {
  commitManualLetter()
  if (!manualMode && activeWord().digits) {
    words.push({ digits: '', cycleIndex: 0 })
  }
  manualMode = !manualMode
  manualWord = ''
  manualDigit = null
  manualIndex = 0
}

function render(): void {
  console.clear()
  console.log('numpad-words TUI')
  console.log(`try: ${SAMPLE_HINT}`)
  console.log(manualMode ? '-- MANUAL MODE (spelling a custom word) --' : '')
  console.log()

  const prior = priorText()
  console.log(`sentence: ${prior}${prior ? ' ' : ''}${guessLabel()}`)
  console.log()

  if (!manualMode && completion() && candidates().length === 0) {
    console.log(`suggestion (tab to accept): ${completion()!.word}`)
  }
  console.log('alternatives:')
  const slots = alternativeSlots()
  for (let i = 0; i < MAX_ALTERNATIVES + 1; i++) {
    const slot = slots[i]
    console.log(slot ? (slot.active ? '' : `  ${slot.word}`) : '')
  }

  console.log()
  console.log('2-9 digit/letter  0/space accept  tab cycle/accept-suggestion')
  console.log('bksp delete  m manual mode  ctrl+u reset  esc/q quit')
}

function main(): void {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    console.error('this script needs an interactive terminal (TTY)')
    process.exit(1)
  }
  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf-8')

  stdin.on('keypress', (str: string, key: { name?: string; ctrl?: boolean }) => {
    if (key.ctrl && key.name === 'c') return quit()
    if (key.ctrl && key.name === 'u') {
      resetAll()
    } else if (key.name === 'escape' || key.name === 'q') {
      return quit()
    } else if (str === 'm') {
      toggleManualMode()
    } else if (key.name === 'backspace') {
      backspace()
    } else if (key.name === 'tab') {
      nextOrAcceptCompletion()
    } else if (str >= '2' && str <= '9') {
      manualMode ? cycleManualLetter(str) : pressDigit(str)
    } else if (str === '1') {
      if (manualMode) cycleManualLetter('1')
    } else if (str === '0' || key.name === 'space') {
      manualMode ? saveManualWord() : accept()
    }

    render()
  })

  render()
}

function quit(): void {
  console.clear()
  process.exit(0)
}

main()
