import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App.vue'
import { buildTrie } from '../src/lib/trie'

const DEFAULT_ENTRIES = [
  { word: 'good', freq: 5 },
  { word: 'home', freq: 20 },
  { word: 'something', freq: 50 },
]

function mockTrieFetch(entries = DEFAULT_ENTRIES) {
  const trie = buildTrie(entries)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ json: () => Promise.resolve(trie) }),
  )
}

async function mountApp(entries?: typeof DEFAULT_ENTRIES) {
  mockTrieFetch(entries)
  const wrapper = mount(App, { attachTo: document.body })
  await flushPromises()
  return wrapper
}

function keyByLetters(wrapper: VueWrapper, letters: string) {
  const button = wrapper
    .findAll('button.key')
    .find((btn) => btn.get('.letters').text() === letters)
  if (!button) throw new Error(`no key found with letters "${letters}"`)
  return button
}

function keyByDigit(wrapper: VueWrapper, digit: string) {
  const button = wrapper
    .findAll('button.key')
    .find((btn) => btn.get('.digit').text() === digit)
  if (!button) throw new Error(`no key found with digit "${digit}"`)
  return button
}

async function tapDigit(wrapper: VueWrapper, digit: string) {
  const btn = keyByDigit(wrapper, digit)
  await btn.trigger('pointerdown')
  await btn.trigger('pointerup')
}

async function holdDigit(wrapper: VueWrapper, digit: string, ms: number) {
  const btn = keyByDigit(wrapper, digit)
  await btn.trigger('pointerdown')
  vi.advanceTimersByTime(ms)
  await btn.trigger('pointerup')
}

function sentenceText(wrapper: VueWrapper): string {
  return wrapper.get('.sentence').text().replace('|', '').trim()
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('typing and prediction', () => {
  it('renders all twelve keypad buttons', async () => {
    const wrapper = await mountApp()
    expect(wrapper.findAll('button.key')).toHaveLength(12)
  })

  it('resolves a digit sequence to the top-ranked word', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    expect(sentenceText(wrapper)).toBe('home') // higher freq than "good" for the same digits
  })

  it('cycles to the next candidate on the same digits', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    await tapDigit(wrapper, '#')
    expect(sentenceText(wrapper)).toBe('good')
  })

  it('selects an alternative by clicking its tag, without finalizing the word', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    const altTag = wrapper.findAll('.tags.mt-2 .tag').find((t) => t.text() === 'good')
    expect(altTag).toBeTruthy()
    await altTag!.trigger('click')
    expect(sentenceText(wrapper)).toBe('good')
  })

  it('accepts the current word so the next digit starts a new one', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    await tapDigit(wrapper, '0') // accept/space
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    expect(sentenceText(wrapper)).toBe('home home')
  })

  it('offers a longer predicted completion as a separate suggestion, not the main display', async () => {
    const wrapper = await mountApp()
    // "s","o","m" - a valid prefix of "something" with no exact-length match
    for (const digit of ['7', '6', '6']) await tapDigit(wrapper, digit)
    expect(sentenceText(wrapper)).toBe('766') // main display stays raw digits
    const suggestion = wrapper.findAll('.tags.mt-2 .tag').find((t) => t.text() === 'something')
    expect(suggestion).toBeTruthy()
  })

  it('accepts the predicted completion with #', async () => {
    const wrapper = await mountApp()
    for (const digit of ['7', '6', '6']) await tapDigit(wrapper, digit)
    await tapDigit(wrapper, '#')
    expect(sentenceText(wrapper)).toBe('something')
  })

  it('accepts the predicted completion by clicking its tag', async () => {
    const wrapper = await mountApp()
    for (const digit of ['7', '6', '6']) await tapDigit(wrapper, digit)
    const suggestion = wrapper.findAll('.tags.mt-2 .tag').find((t) => t.text() === 'something')
    await suggestion!.trigger('click')
    expect(sentenceText(wrapper)).toBe('something')
  })
})

describe('delete and reset', () => {
  it('backspace removes one digit at a time', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    await tapDigit(wrapper, '*')
    expect(sentenceText(wrapper)).toBe('466')
  })

  it('long-press delete clears everything', async () => {
    const wrapper = await mountApp()
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    await tapDigit(wrapper, '0')
    for (const digit of ['4', '6', '6', '3']) await tapDigit(wrapper, digit)
    await holdDigit(wrapper, '*', 500)
    expect(sentenceText(wrapper)).toBe('')
  })
})

describe('literal digit insert', () => {
  it('long-pressing a number inserts its literal digit', async () => {
    const wrapper = await mountApp()
    await holdDigit(wrapper, '5', 500)
    expect(sentenceText(wrapper)).toBe('5')
  })

  it('merges consecutive long-pressed digits into one token', async () => {
    const wrapper = await mountApp()
    await holdDigit(wrapper, '1', 500)
    await holdDigit(wrapper, '2', 500)
    await holdDigit(wrapper, '3', 500)
    expect(sentenceText(wrapper)).toBe('123')
  })
})

describe('manual mode', () => {
  async function enterManualMode(wrapper: VueWrapper) {
    await holdDigit(wrapper, '#', 500)
  }

  it('long-press # enters manual mode, shown by the badge', async () => {
    const wrapper = await mountApp()
    expect(wrapper.find('.tag.is-warning').exists()).toBe(false)
    await enterManualMode(wrapper)
    expect(wrapper.find('.tag.is-warning').exists()).toBe(true)
  })

  it('multi-tap cycles a key\'s letters and auto-commits after a pause', async () => {
    const wrapper = await mountApp()
    await enterManualMode(wrapper)
    // key '2' = a,b,c - two taps selects 'b'
    await tapDigit(wrapper, '2')
    await tapDigit(wrapper, '2')
    vi.advanceTimersByTime(1000)
    await tapDigit(wrapper, '0') // save
    expect(sentenceText(wrapper)).toBe('b')
  })

  it('saving a manual word also exits manual mode', async () => {
    const wrapper = await mountApp()
    await enterManualMode(wrapper)
    await tapDigit(wrapper, '2')
    vi.advanceTimersByTime(1000)
    await tapDigit(wrapper, '0')
    expect(wrapper.find('.tag.is-warning').exists()).toBe(false)
  })

  it('persists a spelled word so it becomes a normal prediction candidate afterward', async () => {
    const wrapper = await mountApp()
    await enterManualMode(wrapper)
    // spell "zog": z=9(4th tap of wxyz), o=6(3rd tap of mno), g=4(1st tap of ghi)
    for (let i = 0; i < 4; i++) await tapDigit(wrapper, '9')
    vi.advanceTimersByTime(1000)
    for (let i = 0; i < 3; i++) await tapDigit(wrapper, '6')
    vi.advanceTimersByTime(1000)
    await tapDigit(wrapper, '4')
    vi.advanceTimersByTime(1000)
    await tapDigit(wrapper, '0') // save

    const { loadCustomWords } = await import('../src/lib/customWords')
    expect(loadCustomWords()).toContain('zog')
  })
})

describe('tips dialog', () => {
  it('opens via the tips button and closes via the close button', async () => {
    const wrapper = await mountApp()
    const dialog = wrapper.get('dialog').element as HTMLDialogElement
    expect(dialog.open).toBe(false)

    await wrapper.get('button[command="show-modal"]').trigger('click')
    expect(dialog.open).toBe(true)

    await wrapper.get('dialog form button').trigger('click')
    expect(dialog.open).toBe(false)
  })
})
