/** Standard ITU E.161 numeric keypad layout. `1` and `0` carry no letters. */
export const DIGIT_LETTERS: Record<string, string> = {
  '2': 'abc',
  '3': 'def',
  '4': 'ghi',
  '5': 'jkl',
  '6': 'mno',
  '7': 'pqrs',
  '8': 'tuv',
  '9': 'wxyz',
}

/** Key '1' has no letters on a real keypad, so - as on classic multi-tap
 * phones - it hosts common symbols instead. */
export const KEY_1_SYMBOLS = ".,?!'-/@&"

const LETTER_DIGIT: Record<string, string> = Object.fromEntries([
  ...Object.entries(DIGIT_LETTERS).flatMap(([digit, letters]) =>
    [...letters].map((letter) => [letter, digit]),
  ),
  // Each key's own digit is reachable at the end of its multi-tap cycle
  // (manual mode), and every symbol lives on key '1' alongside its digit.
  ...Object.keys(DIGIT_LETTERS).map((digit) => [digit, digit]),
  ...[...KEY_1_SYMBOLS].map((symbol) => [symbol, '1']),
  ['1', '1'],
])

/** Converts a word - letters, digits, or key-1 symbols - to its digit sequence,
 * e.g. `home` -> `4663`, `a@b.com` -> `2121266`. */
export function wordToDigits(word: string): string {
  let digits = ''
  for (const letter of word) {
    const digit = LETTER_DIGIT[letter]
    if (!digit) {
      throw new Error(`no keypad digit for character "${letter}" in "${word}"`)
    }
    digits += digit
  }
  return digits
}

/** True if every character in `word` maps onto a keypad digit. */
export function isMappable(word: string): boolean {
  return [...word].every((letter) => letter in LETTER_DIGIT)
}
