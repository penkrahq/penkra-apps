import { useResizeObserver } from '@vueuse/core'
import type { CanvasKit } from 'canvaskit-wasm'
import type { Ref } from 'vue'

type ResizeObserverOptions = {
  canvasRef: Ref<HTMLCanvasElement | null>
  getCanvasKitValue: () => CanvasKit | null
  resizeCanvas: (canvas: HTMLCanvasElement) => void
}

export function useCanvasResizeObserver({
  canvasRef,
  getCanvasKitValue,
  resizeCanvas
}: ResizeObserverOptions) {
  let stopped = false
  let resizing = false

  function cancelResize() {
    stopped = true
  }

  useResizeObserver(canvasRef, () => {
    const canvas = canvasRef.value
    if (stopped || resizing || !canvas || !getCanvasKitValue()) return
    resizing = true
    try {
      resizeCanvas(canvas)
    } finally {
      resizing = false
    }
  })

  return { cancelResize }
}
