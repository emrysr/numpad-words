import { createApp } from 'vue'
import 'bulma/css/bulma.min.css'
import './style.css'
import App from './App.vue'

const mountEl = document.getElementById('app')

/** `createApp(App).mount('#app')` never reads the mount element's own
 * attributes as props - mounting only says *where* to render, not *what*
 * props to pass. `data-*` attributes on #app are forwarded here instead
 * (browsers already camelCase them onto `.dataset`, e.g. `data-button-class`
 * -> `dataset.buttonClass`, matching the prop name exactly), so index.html
 * (a preview for `npm run dev` only - this component isn't meant to be used
 * via a raw index.html once it's consumed as a library) can be edited to try
 * different prop combinations without touching this file. */
const previewProps = mountEl ? { ...mountEl.dataset } : undefined

const previewInput = document.getElementById('preview-text')
const previewDisplay = document.getElementById('preview-text-display')

/** No wrapper/host component is needed to receive the emit either. A
 * compiled template's `v-model="text"` (or `@update:model-value="..."`)
 * expands to a plain `'onUpdate:modelValue': (v) => ...` prop under the
 * hood - `emit('update:modelValue', v)` inside App.vue is just a call to
 * that function if one was passed. createApp's props argument accepts that
 * key directly, by hand, with no template/wrapper component required. */
createApp(App, {
  ...previewProps,
  'onUpdate:modelValue': (value: string) => {
    if (previewInput instanceof HTMLInputElement) previewInput.value = value
    if (previewDisplay) previewDisplay.textContent = value
  },
}).mount(mountEl ?? '#app')
