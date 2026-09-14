<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watch } from 'vue'
import { DIGIT_LETTERS, KEY_1_SYMBOLS, isMappable } from './lib/keymap'
import { bestCompletion, insertWord, lookup, type TrieEntry, type TrieNode } from './lib/trie'
import { loadCustomWords, saveCustomWord } from './lib/customWords'

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

type ClassValue = string | Record<string, boolean> | ClassValue[]

const DEFAULT_BUTTON_CLASS = 'button is-rounded is-flex-direction-column'

const props = defineProps<{
  buttonClass?: ClassValue
  numberButtonClass?: ClassValue
  symbolButtonClass?: ClassValue
}>()

const buttonClass = computed(() => props.buttonClass ?? DEFAULT_BUTTON_CLASS)
const numberButtonClass = computed(() => [buttonClass.value, props.numberButtonClass])
const symbolButtonClass = computed(() => [buttonClass.value, props.symbolButtonClass])

const MAX_ALTERNATIVES = 4
const LONG_PRESS_MS = 450
const MULTI_TAP_TIMEOUT_MS = 900
const CUSTOM_WORD_FREQ = 1_000_000

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

/** '*' only has something to cycle to (or a completion to accept) once there's
 * more than one candidate - until then, short-pressing it does nothing visible,
 * so its label hints at the other thing it does (long-press: manual mode)
 * instead of a "next" that wouldn't go anywhere yet. */
function hasNextChoice(): boolean {
  return candidates.value.length > 1 || completion.value !== null
}

function keyLabel(digit: string): string {
  if (digit === '1') return KEY_1_SYMBOLS.slice(0, 4)
  if (digit === '0') return manualMode.value ? 'save' : 'space'
  // long-press still toggles manual mode either way - the label just flips to
  // hint at exiting it once already inside, rather than entering it again
  if (digit === '*') return manualMode.value ? 'esc' : hasNextChoice() ? 'next' : 'spell'
  if (digit === '#') return 'del'
  return DIGIT_LETTERS[digit].toUpperCase()
}

/** '*' and '#' are pure control keys (cycle/manual-toggle, delete/clear) with no
 * digit meaning of their own, unlike 0-9. */
function isSymbolKey(digit: string): boolean {
  return digit === '*' || digit === '#'
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
const key1PendingSymbol = computed(() =>
  key1Index.value !== null ? KEY_1_SYMBOLS[key1Index.value] : '',
)
const guessLabel = computed(() => {
  if (manualMode.value) return manualWord.value + manualPendingLetter.value
  return (guess.value?.word ?? activeWord.value.digits) + key1PendingSymbol.value
})
const fullText = computed(() => `${priorText.value}${priorText.value ? ' ' : ''}${guessLabel.value}`)
/** Always the same top candidates in the same order/positions, regardless of
 * which one is currently active - cycling only toggles which slot is hidden,
 * so the row never reflows or reshuffles as you cycle through choices. A
 * single candidate is just the guess already shown in the sentence, so
 * there's nothing to pick between and the row stays empty. */
const alternatives = computed(() =>
  candidates.value.length > 1
    ? candidates.value.slice(0, MAX_ALTERNATIVES + 1).map((entry, index) => ({ entry, index }))
    : [],
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

/** Key '1' has no letters on a real keypad, so - independent of manual mode -
 * it always multi-taps through its own punctuation symbols, auto-committing
 * the pending one as a literal character after a pause or when another key
 * is pressed. Otherwise its digit would fall through to pressDigit() and sit
 * there unresolvable, since no dictionary word maps through digit 1. */
const key1Index = ref<number | null>(null)
let key1CommitTimer: ReturnType<typeof setTimeout> | undefined

function commitKey1Symbol(): void {
  clearTimeout(key1CommitTimer)
  if (key1Index.value === null) return
  insertLiteralChar(KEY_1_SYMBOLS[key1Index.value])
  key1Index.value = null
}

function cycleKey1Symbol(): void {
  key1Index.value = key1Index.value === null ? 0 : (key1Index.value + 1) % KEY_1_SYMBOLS.length
  clearTimeout(key1CommitTimer)
  key1CommitTimer = setTimeout(commitKey1Symbol, MULTI_TAP_TIMEOUT_MS)
}

function toggleManualMode(): void {
  commitKey1Symbol()
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
  commitKey1Symbol()
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
  commitKey1Symbol()
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
  commitKey1Symbol()
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

  if (key1Index.value !== null) {
    clearTimeout(key1CommitTimer)
    key1Index.value = null
    return
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
  clearTimeout(key1CommitTimer)
  key1Index.value = null
}

function insertLiteralChar(char: string): void {
  const last = activeWord.value
  if (last.literal) {
    last.digits += char
  } else {
    words.value.push({ digits: char, cycleIndex: 0, literal: true })
  }
  wordInProgress = false
}

function insertLiteralDigit(digit: string): void {
  insertLiteralChar(digit)
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
  '1': () => (manualMode.value ? cycleManualLetter('1') : cycleKey1Symbol()),
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
const nextPress = createLongPress(toggleManualMode, nextOrAcceptCompletion)

function keyPress(digit: string) {
  if (digit === '#') return deletePress
  if (digit === '*') return nextPress
  return digitPresses.get(digit)
}

/** A physical numpad's digit keys report a NumLock-dependent event.key
 * ('End', 'Insert', arrow names, etc. when NumLock is off) but a stable
 * event.code ('Numpad0'..'Numpad9') regardless of NumLock state - fall back
 * to that so the app (built for physical numpad hardware) works whether or
 * not NumLock happens to be on. */
function digitFromEvent(event: KeyboardEvent): string | null {
  const numpadMatch = /^Numpad([0-9])$/.exec(event.code)
  if (numpadMatch) return numpadMatch[1]
  return event.key >= '0' && event.key <= '9' ? event.key : null
}

function handleKeydown(event: KeyboardEvent): void {
  const digit = digitFromEvent(event)
  if (digit !== null && digit >= '2' && digit <= '9') {
    manualMode.value ? cycleManualLetter(digit) : pressDigit(digit)
  } else if (digit === '1') {
    manualMode.value ? cycleManualLetter('1') : cycleKey1Symbol()
  } else if (digit === '0') {
    manualMode.value ? saveManualWord() : accept()
  } else if (event.key === ' ') {
    event.preventDefault()
    manualMode.value ? saveManualWord() : accept()
  } else if (event.key === 'Backspace') {
    backspace()
  } else if (event.key === '*') {
    nextOrAcceptCompletion()
  } else if (event.key === '#') {
    backspace()
  } else if (event.key === 'Tab') {
    event.preventDefault()
    cycleNext()
  }
}

/** Lets a host page read/store the composed text (e.g. into a hidden form
 * field) without reaching into the component's internals - fires on every
 * change, including the initial empty value. Placed after every ref/computed
 * fullText depends on is declared, since {immediate: true} evaluates it
 * synchronously right here. */
watch(fullText, (value) => emit('update:modelValue', value), { immediate: true })

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
  nextPress.cancel()
  clearTimeout(manualCommitTimer)
  clearTimeout(key1CommitTimer)
  for (const press of digitPresses.values()) press.cancel()
})
</script>

<template>
  <div data-label="device" class="box device">
    <div class="screen notification is-dark has-text-success p-1 is-clipped is-flex is-flex-direction-column">
      <div class="sentence is-family-monospace is-flex-grow-1">{{ fullText }}<span class="cursor">|</span></div>
      <div class="tags mt-2">
        <span v-if="manualMode" class="tag is-warning">manual mode</span>
        <span v-if="completion" class="tag" @click="acceptCompletion">{{ completion.word }}</span>
        <span v-for="{ entry, index } in alternatives" :key="entry.word" class="tag"
          :class="{ 'is-current': index === selectedIndex }" @click="selectCandidate(index)">{{ entry.word }}</span>
      </div>
    </div>

    <div class="keypad">
      <template v-for="(row, rowIndex) in KEYPAD_ROWS" :key="rowIndex">
        <button v-for="(digit, colIndex) in row" :key="`${rowIndex}-${colIndex}`" class="key"
          :class="isSymbolKey(digit) ? symbolButtonClass : numberButtonClass" @pointerdown="keyPress(digit)?.down()"
          @pointerup="keyPress(digit)?.up()" @pointerleave="keyPress(digit)?.cancel()">
          <slot name="button" :digit="digit" :label="keyLabel(digit)" :is-symbol="isSymbolKey(digit)">
            <span class="digit has-text-grey">{{ digit }}</span>
            <span class="letters has-text-weight-bold">{{ keyLabel(digit) }}</span>
          </slot>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.device {
  /* Was inherited from a generic `main` selector when this element's root
     tag was <main> - now that a host page owns whatever landmark wraps this
     component, the widget carries its own sizing instead of relying on that. */
  width: 100%;
  min-width: fit-content;
  container-type: inline-size;
  container-name: device;
  --font-lg: clamp(0.75rem, 5.2cqi, 4rem);
  --font-sm: clamp(0.6rem, 3.9cqi, 3rem);
}

/* Fixed dimensions stand in for the target hardware's display, per the
   README's open question of whether there's room for a candidate list. */
.screen {
  aspect-ratio: 3;
  width: 100%;
  box-sizing: border-box;
  font-size: var(--font-lg);
}

.sentence {
  white-space: normal;
  overflow-wrap: break-word;
  overflow: auto;
  /* Reserves the scrollbar's gutter even before there's anything to scroll,
     so the sentence's available width doesn't change (reflowing already-
     wrapped text) the moment a scrollbar appears. Safari doesn't support
     this yet, but its default scrollbars are overlaid (no layout width) in
     most configurations, so the jump there is a rare edge case rather than
     the norm this is guarding against. */
  scrollbar-gutter: stable;
  /* Standard (non-vendor-prefixed) narrow-scrollbar properties, from the CSS
     Scrollbars spec - supported in Firefox and recent Chromium. The
     ::-webkit-scrollbar-* rules below are the equivalent for browsers that
     don't yet support these. */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.35) transparent;
  font-size: var(--font-lg);
}

.sentence::-webkit-scrollbar {
  width: 6px;
}

.sentence::-webkit-scrollbar-track {
  background: transparent;
}

.sentence::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.35);
  border-radius: 3px;
}

/* max-content sizes each column to its button's own width (theming can make
   that smaller than the available space) instead of 1fr always stretching
   the button to fill its column; justify-content centers the resulting
   (possibly narrower) 3-column block within .keypad's own width. The
   minmax(0, ...) floor is kept so columns can still shrink under extreme
   narrow-viewport pressure rather than overflowing the page. */
.keypad {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, max-content));
  justify-content: center;
  gap: 0.5rem;
}

.cursor {
  opacity: 0.5;
}

.key {
  touch-action: manipulation;
  font-size: var(--font-lg);
}

.letters {
  font-size: var(--font-sm);
}

.digit {
  font-size: var(--font-lg);
}

.tags .tag {
  font-size: var(--font-sm);
}

.tag.is-current {
  outline: 1px solid currentColor;
  font-weight: bold;
}

.tags.mt-2 .tag {
  cursor: pointer;
}
</style>
