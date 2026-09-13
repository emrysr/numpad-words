<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { DIGIT_LETTERS, KEY_1_SYMBOLS, isMappable, wordToDigits } from './lib/keymap'
import { bestCompletion, insertWord, lookup, type TrieEntry, type TrieNode } from './lib/trie'
import { loadCustomWords, saveCustomWord } from './lib/customWords'

const MAX_ALTERNATIVES = 4
const LONG_PRESS_MS = 450
const MULTI_TAP_TIMEOUT_MS = 900
const CUSTOM_WORD_FREQ = 1_000_000

const baseUrl = import.meta.env.BASE_URL

const SAMPLE_WORDS = ['good', 'home', 'hello']
const sampleHint = SAMPLE_WORDS.map((word) => `${word} ${wordToDigits(word)}`).join('   ')

const tipsDialog = ref<HTMLDialogElement | null>(null)

/** Falls back for browsers without the declarative command/commandfor
 * attributes on the "tips" button; guarded so it's a no-op where they're
 * already supported and this fires on an already-open dialog. */
function openTips(): void {
  if (!tipsDialog.value?.open) tipsDialog.value?.showModal()
}

/** <dialog> has no built-in click-outside-to-close - a click that lands on
 * the backdrop (rather than any element inside it) targets the dialog
 * itself, which is the standard way to detect it. */
function closeTipsOnBackdropClick(event: MouseEvent): void {
  if (event.target === tipsDialog.value) tipsDialog.value?.close()
}

const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

/** All characters a key cycles through in manual mode: its letters (or
 * symbols, for '1'), followed by its own digit. */
function manualCharsFor(digit: string): string {
  return (digit === '1' ? KEY_1_SYMBOLS : DIGIT_LETTERS[digit]) + digit
}

function keyLabel(digit: string): string {
  if (digit === '1') return manualMode.value ? KEY_1_SYMBOLS.slice(0, 4) : '·'
  if (digit === '0') return manualMode.value ? 'save' : 'space'
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
  manualMode.value || activeWord.value.literal ? [] : candidatesFor(activeWord.value.digits),
)
const selectedIndex = computed(() => selectedIndexFor(candidates.value, activeWord.value.cycleIndex))
const guess = computed(() =>
  selectedIndex.value >= 0 ? candidates.value[selectedIndex.value] : null,
)
/** A longer word predicted from the digits typed so far, before its own
 * digit sequence is complete - only offered when there's no exact match yet,
 * so it never pre-empts a normal candidate. */
const completion = computed<TrieEntry | null>(() => {
  if (manualMode.value || activeWord.value.literal) return null
  if (candidates.value.length > 0) return null
  if (!trie.value || !activeWord.value.digits) return null
  return bestCompletion(trie.value, activeWord.value.digits)
})
const manualPendingLetter = computed(() =>
  manualDigit.value ? manualCharsFor(manualDigit.value)[manualIndex.value] : '',
)
const guessLabel = computed(() => {
  if (manualMode.value) return manualWord.value + manualPendingLetter.value
  return guess.value?.word ?? activeWord.value.digits
})
/** Always the same top candidates in the same order/positions, regardless of
 * which one is currently active - cycling only toggles which slot is hidden,
 * so the row never reflows or reshuffles as you cycle through choices. */
const alternatives = computed(() =>
  candidates.value.slice(0, MAX_ALTERNATIVES + 1).map((entry, index) => ({ entry, index })),
)

function selectCandidate(index: number): void {
  activeWord.value.cycleIndex = index
}

/** Manual multi-tap spelling mode: cycle a key's letters with repeated taps,
 * auto-committing the pending letter after a pause or when another key is pressed. */
const manualMode = ref(false)
const manualWord = ref('')
const manualDigit = ref<string | null>(null)
const manualIndex = ref(0)
let manualCommitTimer: ReturnType<typeof setTimeout> | undefined

function commitManualLetter(): void {
  clearTimeout(manualCommitTimer)
  if (!manualDigit.value) return
  manualWord.value += manualCharsFor(manualDigit.value)[manualIndex.value]
  manualDigit.value = null
  manualIndex.value = 0
}

function cycleManualLetter(digit: string): void {
  if (manualDigit.value === digit) {
    manualIndex.value = (manualIndex.value + 1) % manualCharsFor(digit).length
  } else {
    commitManualLetter()
    manualDigit.value = digit
    manualIndex.value = 0
  }
  clearTimeout(manualCommitTimer)
  manualCommitTimer = setTimeout(commitManualLetter, MULTI_TAP_TIMEOUT_MS)
}

function saveManualWord(): void {
  commitManualLetter()
  const word = manualWord.value
  if (word) {
    words.value.push({ digits: word, cycleIndex: 0, literal: true })
    words.value.push({ digits: '', cycleIndex: 0 })
    if (isMappable(word)) {
      saveCustomWord(word)
      if (trie.value) insertWord(trie.value, { word, freq: CUSTOM_WORD_FREQ })
    }
  }
  manualWord.value = ''
  manualMode.value = false
}

function toggleManualMode(): void {
  commitManualLetter()
  if (!manualMode.value && activeWord.value.digits) {
    // entering manual mode: settle whatever T9 word was mid-composition so it isn't orphaned
    words.value.push({ digits: '', cycleIndex: 0 })
  }
  manualMode.value = !manualMode.value
  manualWord.value = ''
  manualDigit.value = null
  manualIndex.value = 0
}

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

/** Replaces the in-progress (unresolvable at its current length) digits with
 * the predicted completion, rather than leaving them behind as a separate,
 * unmatched slot once this word is no longer active. */
function promoteCompletion(): void {
  if (!completion.value) return
  const last = activeWord.value
  last.digits = completion.value.word
  last.cycleIndex = 0
  last.literal = true
}

/** Finalizes the predicted completion as-is, skipping the rest of its digits. */
function acceptCompletion(): void {
  if (!completion.value) return
  promoteCompletion()
  words.value.push({ digits: '', cycleIndex: 0 })
  wordInProgress = false
}

function nextOrAcceptCompletion(): void {
  if (completion.value) acceptCompletion()
  else cycleNext()
}

function accept(): void {
  wordInProgress = false
}

function backspace(): void {
  if (manualMode.value) {
    if (manualDigit.value) {
      clearTimeout(manualCommitTimer)
      manualDigit.value = null
      manualIndex.value = 0
      return
    }
    if (manualWord.value) {
      manualWord.value = manualWord.value.slice(0, -1)
      return
    }
  }

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
  clearTimeout(manualCommitTimer)
  manualWord.value = ''
  manualDigit.value = null
  manualIndex.value = 0
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
  '0': () => (manualMode.value ? saveManualWord() : accept()),
}

const digitPresses = new Map(
  ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => [
    digit,
    createLongPress(
      () => insertLiteralDigit(digit),
      DIGIT_SHORT_PRESS[digit] ?? (() => (manualMode.value ? cycleManualLetter(digit) : pressDigit(digit))),
    ),
  ]),
)

const deletePress = createLongPress(clearAll, backspace)
const hashPress = createLongPress(toggleManualMode, nextOrAcceptCompletion)

function keyPress(digit: string) {
  if (digit === '*') return deletePress
  if (digit === '#') return hashPress
  return digitPresses.get(digit)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key >= '2' && event.key <= '9') {
    manualMode.value ? cycleManualLetter(event.key) : pressDigit(event.key)
  } else if (event.key === '1') {
    manualMode.value ? cycleManualLetter('1') : pressDigit('1')
  } else if (event.key === '0') {
    manualMode.value ? saveManualWord() : accept()
  } else if (event.key === ' ') {
    event.preventDefault()
    manualMode.value ? saveManualWord() : accept()
  } else if (event.key === 'Backspace') {
    backspace()
  } else if (event.key === '*') {
    backspace()
  } else if (event.key === '#') {
    nextOrAcceptCompletion()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleNext()
  }
}

onMounted(async () => {
  const response = await fetch(`${import.meta.env.BASE_URL}trie.json`)
  const loadedTrie: TrieNode = await response.json()
  for (const word of loadCustomWords()) {
    // Guard against anything that slipped into storage from an older build
    // or manual edits - one bad entry shouldn't take down the whole trie.
    if (isMappable(word)) insertWord(loadedTrie, { word, freq: CUSTOM_WORD_FREQ })
  }
  trie.value = loadedTrie
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  deletePress.cancel()
  hashPress.cancel()
  clearTimeout(manualCommitTimer)
  for (const press of digitPresses.values()) press.cancel()
})
</script>

<template>
    <div class="container">
      <header class="block">
        <h1 class="title is-4"><a class="reset-link" :href="baseUrl">Quick-type on a numpad</a></h1>
        <p class="subtitle is-6">Press a number once for any of its letters - no cycling needed.</p>
        <div class="is-flex is-justify-content-space-between is-flex-wrap-wrap">
          <p class="help">try: {{ sampleHint }}</p>
          <button type="button" class="button is-small" commandfor="tips-dialog" command="show-modal" @click="openTips">
            tips
          </button>
        </div>
      </header>

      <dialog id="tips-dialog" ref="tipsDialog" class="tips-dialog" @click="closeTipsOnBackdropClick">
        <div class="content">
          <p class="help">Long-press # for manual mode, to add custom words and symbols.</p>
          <p class="help">2-9 to spell · 0 to accept · # to cycle · * to delete</p>
          <p class="help">wrong word? press # to cycle through alternate matches</p>
          <p class="help">long-press a number for its digit · long-press * to clear all</p>
        </div>
        <form method="dialog">
          <button type="submit" class="button is-small">close</button>
        </form>
      </dialog>

      <main data-label="device" class="box device">
        <div class="screen notification is-dark has-text-success p-1 is-clipped is-flex is-flex-direction-column">
          <div class="tags mb-0">
            <span v-if="manualMode" class="tag is-warning">manual mode</span>
          </div>
          <div class="sentence is-family-monospace is-flex-grow-1">{{ priorText }}{{ priorText ? ' ' : '' }}{{ guessLabel }}<span class="cursor">|</span></div>
          <div class="tags mt-2">
            <span v-if="completion" class="tag" @click="acceptCompletion">{{ completion.word }}</span>
            <span
              v-for="{ entry, index } in alternatives"
              :key="entry.word"
              class="tag"
              :class="{ 'is-invisible': index === selectedIndex }"
              @click="selectCandidate(index)"
            >{{ entry.word }}</span>
          </div>
        </div>

        <div class="fixed-grid has-3-cols">
          <div class="grid is-gap-1">
            <template v-for="(row, rowIndex) in KEYPAD_ROWS" :key="rowIndex">
              <button
                v-for="(digit, colIndex) in row"
                :key="`${rowIndex}-${colIndex}`"
                class="button key is-rounded is-flex-direction-column"
                @pointerdown="keyPress(digit)?.down()"
                @pointerup="keyPress(digit)?.up()"
                @pointerleave="keyPress(digit)?.cancel()"
              >
                <span class="letters has-text-weight-bold">{{ keyLabel(digit) }}</span>
                <span class="digit has-text-grey">{{ digit }}</span>
              </button>
            </template>
          </div>
        </div>
      </main>

    </div>
</template>

<style scoped>

/* #app centers its content (align-items: center in style.css) instead of
   stretching it, and has no explicit width itself - so when its content
   wants to be wider than the viewport, #app (and the page) grow to fit it
   rather than clamping it. A max-width relative to #app doesn't break that
   cycle since #app's own size is what's in question; 100vw is the one
   reference that can't be inflated by this. */
.container {
  max-width: calc(100vw - 32px);
}
main {
    width: clamp(12rem, 50vmin, 30rem);
}

.tips-dialog {
  max-width: min(24rem, 90vw);
  border: none;
  border-radius: var(--bulma-radius-large);
  padding: 1.25rem 1.5rem;
}

.tips-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}

.device {
    min-width: fit-content;
    container-type: inline-size;
    container-name: device;
    /* Text scales with the device box's own width via cqi, with only a
       readability floor - no fixed upper rem cap. The box's own max-width
       above is what naturally stops growth (and therefore font growth) on
       large screens; a second, independent ceiling here would just drift
       out of sync with it, which is exactly what happened before. */
    --font-lg: clamp(0.75rem, 5.2cqi, 4rem);
    --font-sm: clamp(0.6rem, 3.9cqi, 3rem);
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
  /* Bulma sizes .notification's own padding in em, relative to this element's
     font-size - so this has to scale too, not just the .sentence text inside. */
  font-size: var(--font-lg);
}

.sentence {
  white-space: nowrap;
  font-size: var(--font-lg);
}

/* Bulma's grid tracks default to plain 1fr, which won't shrink below a
   button's own min-content width - that floor was propagating out through
   .device's min-width: fit-content and overflowing the page on narrow
   viewports. minmax(0, 1fr) lets columns shrink the rest of the way. */
.fixed-grid > .grid {
  grid-template-columns: repeat(var(--bulma-grid-column-count), minmax(0, 1fr));
}

.cursor {
  opacity: 0.5;
}

.key {
  touch-action: manipulation;
  /* Bulma sizes .button's own padding in em, relative to this element's
     font-size - so this has to scale too, not just the .letters/.digit text. */
  font-size: var(--font-lg);
}

.letters {
  font-size: var(--font-lg);
}

.digit {
  font-size: var(--font-sm);
}

.tags .tag {
  font-size: var(--font-sm);
}

/* Alternatives/completion tags are clickable; the manual-mode badge isn't. */
.tags.mt-2 .tag {
  cursor: pointer;
}

.help {
  font-size: var(--bulma-help-size);
}

</style>
