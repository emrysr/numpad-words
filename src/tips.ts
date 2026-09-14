/**
 * Vanilla DOM wiring for the tips dialog in index.html - page chrome, not
 * part of the reusable Vue widget, so it doesn't need Vue at all.
 */
export {} // forces module (not global script) scope, so this can be imported directly in tests

const tipsDialog = document.getElementById('tips-dialog')
const tipsButton = document.querySelector('button[commandfor="tips-dialog"]')

if (tipsDialog instanceof HTMLDialogElement && tipsButton) {
  /** Falls back for browsers without the declarative command/commandfor
   * attributes on the button; guarded so it's a no-op where they're already
   * supported and this fires on an already-open dialog. */
  tipsButton.addEventListener('click', () => {
    if (!tipsDialog.open) tipsDialog.showModal()
  })

  /** <dialog> has no built-in click-outside-to-close - a click that lands on
   * the backdrop (rather than any element inside it) targets the dialog
   * itself, which is the standard way to detect it. */
  tipsDialog.addEventListener('click', (event) => {
    if (event.target === tipsDialog) tipsDialog.close()
  })
}
