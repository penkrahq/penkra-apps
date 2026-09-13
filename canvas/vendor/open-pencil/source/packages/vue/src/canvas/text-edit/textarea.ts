import { watch } from 'vue'
import type { ShallowRef } from 'vue'

import type { Editor } from '@open-pencil/core/editor'

export function createHiddenTextArea() {
  const textarea = document.createElement('textarea')
  textarea.setAttribute('aria-label', 'Canvas text editor')
  textarea.tabIndex = -1
  textarea.style.position = 'fixed'
  textarea.style.left = '0'
  textarea.style.top = '0'
  textarea.style.width = '1px'
  textarea.style.height = '1px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  return textarea
}

export function focusTextAreaOnCanvasPointerDown(
  textareaRef: ShallowRef<HTMLTextAreaElement | null>,
  store: Editor
) {
  if (store.state.editingTextId && textareaRef.value) {
    requestAnimationFrame(() => textareaRef.value?.focus())
  }
}

export function useTextEditingSession({
  store,
  textareaRef,
  resetBlink,
  stopBlink,
  resetComposition
}: {
  store: Editor
  textareaRef: ShallowRef<HTMLTextAreaElement | null>
  resetBlink: () => void
  stopBlink: () => void
  resetComposition: () => void
}) {
  watch(
    () => store.state.editingTextId,
    (id, _, onCleanup) => {
      if (id) {
        const el = createHiddenTextArea()
        textareaRef.value = el
        el.focus()
        resetBlink()

        onCleanup(() => {
          stopBlink()
          el.remove()
          textareaRef.value = null
          resetComposition()
        })
      }
    }
  )
}
