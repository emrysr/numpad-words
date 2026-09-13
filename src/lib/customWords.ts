const STORAGE_KEY = 'numpad-words:custom-words'

/** Minimal key-value store shape - `localStorage` satisfies this directly;
 * other hosts (e.g. the Node TUI) can supply a file-backed equivalent. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStore(): KeyValueStore {
  return localStorage
}

/** Words the user has manually spelled out, remembered per-device (or per-store)
 * so they show up as T9 candidates on future visits. */
export function loadCustomWords(store: KeyValueStore = browserStore()): string[] {
  try {
    const raw = store.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomWord(word: string, store: KeyValueStore = browserStore()): void {
  try {
    const words = loadCustomWords(store)
    if (words.includes(word)) return
    words.push(word)
    store.setItem(STORAGE_KEY, JSON.stringify(words))
  } catch {
    // store unavailable (e.g. private browsing) - word still works this session
  }
}
