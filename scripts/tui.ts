/**
 * Terminal harness for the trie: press numpad digits, see ranked candidates.
 *
 * Usage: npm run tui
 *
 * 2-9   add a digit
 * 0/space accept the guess and start a new word
 * tab   cycle to the next candidate
 * bksp  remove the last digit
 * esc/q quit
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { emitKeypressEvents } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { DIGIT_LETTERS, wordToDigits } from '../src/lib/keymap'
import { lookup, type TrieEntry, type TrieNode } from '../src/lib/trie'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const TRIE_PATH = resolve(ROOT, 'public/trie.json')

const trie: TrieNode = JSON.parse(readFileSync(TRIE_PATH, 'utf-8'))

const MAX_ALTERNATIVES = 7

/** good/home share 4663 - a built-in demo of the ranking collision. */
const SAMPLE_WORDS = ['good', 'home', 'hello']
const SAMPLE_HINT = SAMPLE_WORDS.map((word) => `${word} ${wordToDigits(word)}`).join('   ')

let digits = ''
let cycleIndex = 0
let sentence = ''

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', ''],
]

function keyLabel(digit: string): string {
  if (digit === '1') return '·'
  if (digit === '0') return 'space'
  return DIGIT_LETTERS[digit].toUpperCase()
}

function renderKeymap(): string {
  const lastDigit = digits.at(-1)
  return KEYPAD_ROWS.map((row) =>
    row
      .map((digit) => {
        if (!digit) return ''.padEnd(11)
        const cell = `${digit} ${keyLabel(digit)}`
        return (digit === lastDigit ? `[${cell}]` : cell).padEnd(11)
      })
      .join(''),
  ).join('\n')
}

function candidatesFor(digitString: string): TrieEntry[] {
  return digitString ? lookup(trie, digitString) : []
}

function render(): void {
  const candidates = candidatesFor(digits)
  const selectedIndex = candidates.length ? cycleIndex % candidates.length : -1
  const guess = selectedIndex >= 0 ? candidates[selectedIndex] : null
  const alternatives = candidates.filter((_, i) => i !== selectedIndex).slice(0, MAX_ALTERNATIVES)

  console.clear()
  console.log('numpad-words TUI')
  console.log(`try: ${SAMPLE_HINT}\n`)
  console.log(renderKeymap())
  console.log()
  console.log(`sentence: ${sentence}${digits}`)
  console.log(`digits:   ${digits || '(none)'}`)
  console.log()
  console.log(`guess:    ${guess ? guess.word : digits ? '(no match)' : ''}`)
  console.log()
  console.log('alternatives:')
  for (let i = 0; i < MAX_ALTERNATIVES; i++) {
    const entry = alternatives[i]
    console.log(entry ? `  ${entry.word.padEnd(16)} freq=${entry.freq}` : '')
  }

  console.log('\n2-9 digit  0/space accept+new word  tab cycle  bksp delete  esc/q quit')
}

function acceptCurrent(): void {
  const candidates = candidatesFor(digits)
  const selected = candidates.length ? candidates[cycleIndex % candidates.length] : null
  if (selected) {
    sentence += `${selected.word} `
  } else if (digits) {
    sentence += `[${digits}] `
  } else {
    sentence += ' '
  }
  digits = ''
  cycleIndex = 0
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
    if (key.name === 'escape' || key.name === 'q') return quit()

    if (key.name === 'backspace') {
      digits = digits.slice(0, -1)
      cycleIndex = 0
    } else if (key.name === 'tab') {
      cycleIndex++
    } else if (str >= '2' && str <= '9') {
      digits += str
      cycleIndex = 0
    } else if (str === '0' || key.name === 'space') {
      acceptCurrent()
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
