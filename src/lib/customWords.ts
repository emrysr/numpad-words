const STORAGE_KEY = 'numpad-words:custom-words'

/** Words the user has manually spelled out, remembered per-device via
 * localStorage so they show up as T9 candidates on future visits. */
export function loadCustomWords(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCustomWord(word: string): void {
  try {
    const words = loadCustomWords()
    if (words.includes(word)) return
    words.push(word)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(words))
  } catch {
    // localStorage unavailable (e.g. private browsing) - word still works this session
  }
}
