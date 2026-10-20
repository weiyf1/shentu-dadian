import {
  computed,
  onBeforeUnmount,
  reactive,
  ref,
  shallowRef,
} from 'vue'

import {
  clamp,
  clampPan,
  fitViewport,
  getScaleBounds,
  viewportToImage,
  zoomAt,
  type Point,
  type ViewportState,
} from '@/lib/viewportMath'

export function useImageViewport() {
  const stageElement = shallowRef<HTMLElement | null>(null)
  const state = reactive<ViewportState>({
    scale: 1,
    panX: 0,
    panY: 0,
  })
  const imageSize = reactive({ width: 0, height: 0 })
  const viewportSize = reactive({ width: 0, height: 0 })
  const fitScale = ref(1)
  const initialized = ref(false)
  let resizeObserver: ResizeObserver | null = null

  const zoomPercent = computed(() => Math.round(state.scale * 100))
  const scaleBounds = computed(() => getScaleBounds(fitScale.value))
  const inverseScale = computed(() =>
    state.scale > 0 ? 1 / state.scale : 1,
  )

  function measureViewport(): void {
    const element = stageElement.value
    if (!element) return

    viewportSize.width = element.clientWidth
    viewportSize.height = element.clientHeight

    if (!imageSize.width || !imageSize.height) return

    if (!initialized.value) {
      fit()
    } else {
      applyPanClamp()
    }
  }

  function attach(element: HTMLElement | null): void {
    if (stageElement.value === element) return

    resizeObserver?.disconnect()
    stageElement.value = element

    if (!element) return

    resizeObserver = new ResizeObserver(() => measureViewport())
    resizeObserver.observe(element)
    measureViewport()
  }

  function fit(): void {
    if (
      !imageSize.width ||
      !imageSize.height ||
      !viewportSize.width ||
      !viewportSize.height
    ) {
      return
    }

    const next = fitViewport(
      viewportSize.width,
      viewportSize.height,
      imageSize.width,
      imageSize.height,
    )
    fitScale.value = next.fitScale
    state.scale = next.scale
    state.panX = next.panX
    state.panY = next.panY
    initialized.value = true
  }

  function setImageSize(width: number, height: number): void {
    imageSize.width = width
    imageSize.height = height
    initialized.value = false
    measureViewport()
  }

  function reset(): void {
    imageSize.width = 0
    imageSize.height = 0
    state.scale = 1
    state.panX = 0
    state.panY = 0
    initialized.value = false
  }

  function clampState(nextState: ViewportState): ViewportState {
    if (!imageSize.width || !imageSize.height) return nextState

    return clampPan(
      nextState,
      viewportSize.width,
      viewportSize.height,
      imageSize.width,
      imageSize.height,
    )
  }

  function applyPanClamp(): void {
    const next = clampState(state)
    state.panX = next.panX
    state.panY = next.panY
  }

  function setPan(panX: number, panY: number): void {
    const next = clampState({ ...state, panX, panY })
    state.panX = next.panX
    state.panY = next.panY
  }

  function setViewport(nextState: ViewportState): void {
    const next = clampState(nextState)
    state.scale = next.scale
    state.panX = next.panX
    state.panY = next.panY
  }

  function panBy(deltaX: number, deltaY: number): void {
    setPan(state.panX + deltaX, state.panY + deltaY)
  }

  function zoomAtPoint(factor: number, anchor?: Point): void {
    if (!initialized.value) return

    const bounds = scaleBounds.value
    const targetScale = clamp(
      state.scale * factor,
      bounds.minScale,
      bounds.maxScale,
    )
    const zoomAnchor = anchor ?? {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    }
    const next = clampState(zoomAt(state, zoomAnchor, targetScale))
    state.scale = next.scale
    state.panX = next.panX
    state.panY = next.panY
  }

  function setScaleAtPoint(scale: number, anchor: Point): void {
    if (!initialized.value) return

    const bounds = scaleBounds.value
    const targetScale = clamp(scale, bounds.minScale, bounds.maxScale)
    const next = clampState(zoomAt(state, anchor, targetScale))
    state.scale = next.scale
    state.panX = next.panX
    state.panY = next.panY
  }

  function toImagePoint(point: Point): Point {
    return viewportToImage(point, state)
  }

  function centerOnImagePoint(point: Point, scale = state.scale): void {
    const bounds = scaleBounds.value
    const targetScale = clamp(scale, bounds.minScale, bounds.maxScale)
    const next = clampState({
      scale: targetScale,
      panX: viewportSize.width / 2 - point.x * targetScale,
      panY: viewportSize.height / 2 - point.y * targetScale,
    })
    state.scale = next.scale
    state.panX = next.panX
    state.panY = next.panY
  }

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
  })

  return {
    stageElement,
    state,
    imageSize,
    viewportSize,
    fitScale,
    zoomPercent,
    scaleBounds,
    inverseScale,
    attach,
    fit,
    reset,
    setImageSize,
    panBy,
    setPan,
    setViewport,
    zoomAtPoint,
    setScaleAtPoint,
    toImagePoint,
    centerOnImagePoint,
  }
}
