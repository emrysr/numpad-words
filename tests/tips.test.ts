import { beforeEach, describe, expect, it, vi } from 'vitest'

/** src/tips.ts wires itself up at import time by querying the DOM, so each
 * test needs the DOM in place first and a fresh module instance afterward -
 * a cached import from an earlier test would query stale/removed elements. */
async function loadTipsModule() {
  vi.resetModules()
  await import('../src/tips')
}

function setUpDom() {
  document.body.innerHTML = `
    <dialog id="tips-dialog" class="tips-dialog">
      <div class="content">tips</div>
      <form method="dialog"><button type="submit">close</button></form>
    </dialog>
    <button type="button" commandfor="tips-dialog" command="show-modal">tips</button>
  `
}

describe('tips dialog wiring', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('opens the dialog on button click and closes it on backdrop click', async () => {
    setUpDom()
    await loadTipsModule()

    const dialog = document.getElementById('tips-dialog') as HTMLDialogElement
    const button = document.querySelector('button[commandfor="tips-dialog"]') as HTMLButtonElement
    expect(dialog.open).toBe(false)

    button.click()
    expect(dialog.open).toBe(true)

    // a click landing on the dialog element itself (not a descendant) is how
    // a backdrop click - which <dialog> has no native event for - is detected
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(dialog.open).toBe(false)
  })

  it('is a no-op on an already-open dialog, for browsers with native command/commandfor support', async () => {
    setUpDom()
    await loadTipsModule()
    const dialog = document.getElementById('tips-dialog') as HTMLDialogElement
    const button = document.querySelector('button[commandfor="tips-dialog"]') as HTMLButtonElement

    dialog.showModal()
    expect(dialog.open).toBe(true)
    button.click()
    expect(dialog.open).toBe(true)
  })
})
