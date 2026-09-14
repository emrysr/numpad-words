# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A T9-style predictive text entry system for numeric keypads (proof of concept for
hardware with no room for a full keyboard). `2`-`9` compose a digit sequence; a
digit-keyed trie built from the SUBTLEX-UK frequency corpus resolves it to ranked
word candidates. There are two UIs sharing the same core logic: a Vue browser app
(`src/App.vue`) and a Node terminal harness (`scripts/tui.ts`).

See `README.md` for the full feature set, the "how it works" pipeline, and design
rationale (why SUBTLEX, why a plain trie, why n-gram before neural, etc.) — it's
kept up to date and is the source of truth for product/UX intent. See
`docs/01.vue-component.md` for `src/App.vue`'s public surface as a reusable
component (the `update:modelValue` emit, keypad button class props, and the
`#button` scoped slot) — keep it in sync with that surface when changing it.

## Commands

```bash
npm run dev          # Vite dev server (browser app)
npm run tui           # terminal harness — same lookup/interaction model, no browser
npm run build          # vue-tsc -b && vite build
npm test               # vitest run (all tests, once)
npm run test:watch     # vitest watch mode
npx vitest run tests/keymap.test.ts   # single test file
npx vitest run -t "cycles to the next candidate"  # single test by name
npx vue-tsc -b          # type-check only (covers app + scripts via project references)
npm run build:trie     # rebuild public/trie.json from data/raw/SUBTLEX-UK.txt (not checked into git; download from https://psychology.nottingham.ac.uk/subtlex-uk/ first)
```

## Architecture

### Framework-agnostic core (`src/lib/`)

`keymap.ts`, `trie.ts`, and `customWords.ts` contain all the actual logic and have
no Vue or DOM dependency. Both `src/App.vue` and `scripts/tui.ts` import directly
from here rather than duplicating trie/keymap logic.

- **`keymap.ts`** — the ITU E.161 layout (`DIGIT_LETTERS`). Key `1` has no letters
  on a real keypad, so it's special-cased to carry punctuation symbols instead
  (`KEY_1_SYMBOLS`). `wordToDigits`/`isMappable` convert between characters and
  digit sequences and are the single source of truth for what a "word" even means
  here (letters, digits, and key-1 symbols all map to a digit).
- **`trie.ts`** — a plain digit-keyed trie (`TrieNode` = `children` + `words`
  sorted by frequency + a cached `best` completion). `buildTrie` constructs it
  once; `lookup` does exact digit-sequence resolution; `bestCompletion` predicts a
  longer word before its full digit sequence is typed (used for the "completion"
  suggestion feature); `insertWord` merges in a single learned word ahead of any
  built-in match for the same digits, keeping ancestor `best` caches in sync.
- **`customWords.ts`** — persists user-taught words behind a minimal
  `KeyValueStore` interface (`getItem`/`setItem`). The browser app supplies
  `localStorage`; the TUI supplies a JSON-file-backed store
  (`data/tui-custom-words.json`) so both hosts share the exact same
  load/save logic.

### Build-time trie generation (`scripts/build-trie.ts`)

Offline, one-off: reads the raw SUBTLEX-UK corpus (tab-delimited, `Spelling`/
`FreqCount` columns), filters to the top 50k mappable words by frequency, and
writes the compact trie as `public/trie.json`. This file ships with the app and
is what `fetch`ed at runtime — there's no server-side lookup.

### Two parallel UIs, one interaction model

`src/App.vue` (Vue, reactive refs) and `scripts/tui.ts` (plain variables,
manual `render()` calls) **independently implement the same state machine** —
neither imports the other. When changing interaction behavior, both files
normally need the equivalent change made twice. The shared model:

- **`WordSlot[]`** — the sentence is a list of `{ digits, cycleIndex, literal? }`
  slots. Non-literal slots hold a raw digit sequence resolved against the trie at
  render time (`resolveWord`); `literal` slots hold actual characters (from
  long-press digit insert, manual mode, or key-1 punctuation) and bypass the trie
  entirely. Only the last slot is ever "in progress"; accept (`0`/space) seals it
  so the next digit starts a new slot.
- **Cycling** — `cycleIndex` selects among a slot's ranked candidates
  (`selectedIndexFor` wraps modulo the candidate count); cycling never changes the
  candidate list's order, only which one is currently selected, so the
  alternatives row never reflows.
- **Completion prediction** — `bestCompletion` offers a longer word than what's
  typed so far, but only when there's no exact-length candidate yet, so it never
  pre-empts a real match.
- **Manual multi-tap mode** — long-press the cycle/manual key to enter classic
  Nokia-style spelling: repeated taps cycle a key's letters (or symbols on key
  `1`), auto-committing after `MULTI_TAP_TIMEOUT_MS` or on the next keypress.
  Words spelled this way are pushed as `literal` slots and, if fully mappable,
  learned via `customWords.ts` + `insertWord` so they become normal predictive
  candidates afterward. Key `1`'s punctuation cycling uses this same multi-tap
  mechanism even *outside* manual mode (it has to — there's no dictionary word
  whose digits are all `1`s, so short-pressing `1` can never resolve through the
  trie).
- **Long-press semantics** — every digit key does something extra on long-press:
  a number inserts its own digit as a literal character (consecutive long-presses
  merge into one literal token, e.g. a phone number); the delete key long-press
  clears everything; the cycle key long-press toggles manual mode.
- **Keymap note** — `*` is cycle/next (long-press: toggle manual mode) and `#` is
  delete/backspace (long-press: clear all). This is the opposite of the visual
  left-to-right numpad order you might expect — it was deliberately flipped so
  backspace sits on the right side, matching instinctive phone-keypad muscle
  memory. Don't "fix" this back without checking `README.md`'s keymap section and
  the tips dialog copy in `index.html`, which document the current mapping.

### Page chrome lives outside the Vue component

`src/App.vue`'s template is just the widget (screen + keypad, root a plain `<div>`)
— the header, tips `<dialog>`, and footer are static markup in `index.html`, with
`src/tips.ts` (plain DOM, no Vue) wiring the dialog's open/close behavior. This
split is deliberate (see `docs/01.vue-component.md`): a reusable component
shouldn't render page-level landmarks like `<main>` or dictate a host's header/
footer. Layout CSS is split the same way — `.container`/`.tips-dialog`/`.reset-link`/
`.help` live in `src/style.css` (global) since they style elements outside the
component now; `.device` and everything under it stays in `src/App.vue`'s
`<style scoped>`. Note: this repo is checked out on a `/mnt/c/...` DrvFS mount in
WSL — Vite's dev-server file watcher can silently miss edits there, so if a change
doesn't show up, restart `npm run dev` before assuming the code is wrong.

### PWA / offline (`vite.config.ts`)

`vite-plugin-pwa` precaches `trie.json` explicitly — Workbox's default glob
doesn't include `.json`, and the default 2MB precache size limit is raised to
10MB because the trie is several MB and grows as it gains per-node metadata.
Both need updating together if the trie format or size changes significantly.

### Tests

Vitest + `@vue/test-utils` + `happy-dom`. `tests/App.test.ts` drives the real
component via simulated `pointerdown`/`pointerup` events (see `tapDigit`/
`holdDigit` helpers) rather than calling internal functions directly, so it
exercises the same long-press timing logic (`vi.useFakeTimers()` +
`vi.advanceTimersByTime`) a real user would trigger. `tests/setup.ts` clears
`localStorage` after every test to keep custom-word persistence isolated between
tests.
