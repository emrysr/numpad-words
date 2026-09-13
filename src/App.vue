<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { DIGIT_LETTERS, wordToDigits } from './lib/keymap'
import { lookup, type TrieEntry, type TrieNode } from './lib/trie'

const MAX_ALTERNATIVES = 4
const LONG_PRESS_MS = 450

const baseUrl = import.meta.env.BASE_URL

const SAMPLE_WORDS = ['good', 'home', 'hello']
const sampleHint = SAMPLE_WORDS.map((word) => `${word} ${wordToDigits(word)}`).join('   ')

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

function keyLabel(digit: string): string {
  if (digit === '1') return '·'
  if (digit === '0') return 'space'
  if (digit === '*') return 'del'
  if (digit === '#') return 'next'
  return DIGIT_LETTERS[digit].toUpperCase()
}

interface WordSlot {
  digits: string
  cycleIndex: number
  /** True for a slot whose digits are literal characters (from a long-press),
   * bypassing trie lookup and staying open to more literal digits. */
  literal?: boolean
}

/** Candidate picks for a settled word don't disappear on accept - only the
 * next digit press starts a new word. This tracks whether the next digit
 * should extend the last slot (still composing) or push a new one. */
let wordInProgress = true

const trie = ref<TrieNode | null>(null)
const words = ref<WordSlot[]>([{ digits: '', cycleIndex: 0 }])
const activeWord = computed(() => words.value[words.value.length - 1])

function candidatesFor(wordDigits: string): TrieEntry[] {
  return trie.value && wordDigits ? lookup(trie.value, wordDigits) : []
}

function selectedIndexFor(candidateList: TrieEntry[], slotCycleIndex: number): number {
  const length = candidateList.length
  return length ? ((slotCycleIndex % length) + length) % length : -1
}

function resolveWord(slot: WordSlot): string {
  if (slot.literal) return slot.digits
  if (!slot.digits) return ''
  const candidateList = candidatesFor(slot.digits)
  const index = selectedIndexFor(candidateList, slot.cycleIndex)
  return index >= 0 ? candidateList[index].word : `[${slot.digits}]`
}

const priorText = computed(() => words.value.slice(0, -1).map(resolveWord).filter(Boolean).join(' '))

const candidates = computed<TrieEntry[]>(() =>
  activeWord.value.literal ? [] : candidatesFor(activeWord.value.digits),
)
const selectedIndex = computed(() => selectedIndexFor(candidates.value, activeWord.value.cycleIndex))
const guess = computed(() =>
  selectedIndex.value >= 0 ? candidates.value[selectedIndex.value] : null,
)
const guessLabel = computed(() => guess.value?.word ?? activeWord.value.digits)
const alternatives = computed(() =>
  candidates.value.filter((_, i) => i !== selectedIndex.value).slice(0, MAX_ALTERNATIVES),
)

function pressDigit(digit: string): void {
  if (!digit) return
  const last = activeWord.value
  if (last.literal || (!wordInProgress && last.digits)) {
    words.value.push({ digits: digit, cycleIndex: 0 })
  } else {
    last.digits += digit
    last.cycleIndex = 0
  }
  wordInProgress = true
}

function cycleNext(): void {
  activeWord.value.cycleIndex++
}

function accept(): void {
  wordInProgress = false
}

function backspace(): void {
  const last = activeWord.value
  if (last.digits) {
    last.digits = last.digits.slice(0, -1)
    last.cycleIndex = 0
    wordInProgress = true
  } else if (words.value.length > 1) {
    words.value.pop()
    wordInProgress = true
  }
}

function clearAll(): void {
  words.value = [{ digits: '', cycleIndex: 0 }]
  wordInProgress = true
}

function insertLiteralDigit(digit: string): void {
  const last = activeWord.value
  if (last.literal) {
    last.digits += digit
  } else {
    words.value.push({ digits: digit, cycleIndex: 0, literal: true })
  }
  wordInProgress = false
}

function createLongPress(onLongPress: () => void, onShortPress: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let fired = false
  return {
    down(): void {
      fired = false
      timer = setTimeout(() => {
        fired = true
        onLongPress()
      }, LONG_PRESS_MS)
    },
    up(): void {
      clearTimeout(timer)
      if (!fired) onShortPress()
    },
    cancel(): void {
      clearTimeout(timer)
    },
  }
}

const DIGIT_SHORT_PRESS: Record<string, () => void> = {
  '0': accept,
  '1': () => {},
}

const digitPresses = new Map(
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => [
    digit,
    createLongPress(() => insertLiteralDigit(digit), DIGIT_SHORT_PRESS[digit] ?? (() => pressDigit(digit))),
  ]),
)

function digitPress(digit: string) {
  return digitPresses.get(digit)
}

const deletePress = createLongPress(clearAll, backspace)

function handleKeydown(event: KeyboardEvent): void {
  if (event.key >= '2' && event.key <= '9') {
    pressDigit(event.key)
  } else if (event.key === '0') {
    accept()
  } else if (event.key === ' ') {
    event.preventDefault()
    accept()
  } else if (event.key === 'Backspace') {
    backspace()
  } else if (event.key === '*') {
    backspace()
  } else if (event.key === '#') {
    cycleNext()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleNext()
  }
}

onMounted(async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}trie.json`)
  trie.value = await response.json()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  deletePress.cancel()
  for (const press of digitPresses.values()) press.cancel()
})
</script>

<template>
    <div class="container">
      <header>
        <h1 class="title is-4"><a class="reset-link" :href="baseUrl">Num pad text entry</a></h1>
        <p>Type out words with the corresponding number key</p>
        <p class="help">try: {{ sampleHint }}</p>
      </header>

      <main data-label="device" class="box device">
        <div class="screen notification is-dark has-text-success p-1 is-clipped is-flex is-flex-direction-column">
          <div class="sentence is-family-monospace is-flex-grow-1">{{ priorText }}{{ priorText ? ' ' : '' }}{{ guessLabel }}<span class="cursor">|</span></div>
          <div class="tags are-small mt-2">
            <span v-for="entry in alternatives" :key="entry.word" class="tag">{{ entry.word }}</span>
          </div>
        </div>

        <div class="fixed-grid has-3-cols">
          <div class="grid is-gap-1">
            <template v-for="(row, rowIndex) in KEYPAD_ROWS" :key="rowIndex">
              <button
                v-for="(digit, colIndex) in row"
                :key="`${rowIndex}-${colIndex}`"
                class="button is-rounded is-flex-direction-column"
                @pointerdown="digit === '*' ? deletePress.down() : digitPress(digit)?.down()"
                @pointerup="digit === '*' ? deletePress.up() : digitPress(digit)?.up()"
                @pointerleave="digit === '*' ? deletePress.cancel() : digitPress(digit)?.cancel()"
                @click="digit === '#' ? cycleNext() : undefined"
              >
                <span class="letters title is-6 mb-0">{{ keyLabel(digit) }}</span>
                <span class="digit is-size-7 has-text-grey">{{ digit }}</span>
              </button>
            </template>
          </div>
        </div>
      </main>

      <footer>
        <p class="help">2-9 to spell · 0 to accept · # to cycle · * to delete</p>
      </footer>
    </div>
</template>

<style scoped>

.device {
    min-width: fit-content;
    max-width: 19.3rem;
}


.reset-link {
  color: inherit;
  text-decoration: none;
}

.reset-link:hover {
  text-decoration: underline;
}

/* Fixed dimensions stand in for the target hardware's display, per the
   README's open question of whether there's room for a candidate list. */
.screen {
  aspect-ratio:3;
  width: 100%;
  box-sizing: border-box;
}

.sentence {
  white-space: nowrap;
}

.cursor {
  opacity: 0.5;
}

.key {
  touch-action: manipulation;
}

.tags.are-small .tag:not(.is-normal):not(.is-medium):not(.is-large) {
    font-size: var(--bulma-size-small);
}
.help {
  font-size: var(--bulma-help-size);
}

</style>
