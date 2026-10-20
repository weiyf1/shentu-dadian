export interface Point {
  x: number
  y: number
}

export interface ViewportState {
  scale: number
  panX: number
  panY: number
}

export interface FitResult extends ViewportState {
  fitScale: number
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function fitViewport(
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  padding = 24,
): FitResult {
  const availableWidth = Math.max(1, viewportWidth - padding * 2)
  const availableHeight = Math.max(1, viewportHeight - padding * 2)
  const fitScale = Math.min(
    availableWidth / imageWidth,
    availableHeight / imageHeight,
    1,
  )

  return {
    scale: fitScale,
    fitScale,
    panX: (viewportWidth - imageWidth * fitScale) / 2,
    panY: (viewportHeight - imageHeight * fitScale) / 2,
  }
}

export function imageToViewport(
  point: Point,
  state: ViewportState,
): Point {
  return {
    x: state.panX + point.x * state.scale,
    y: state.panY + point.y * state.scale,
  }
}

export function viewportToImage(
  point: Point,
  state: ViewportState,
): Point {
  return {
    x: (point.x - state.panX) / state.scale,
    y: (point.y - state.panY) / state.scale,
  }
}

export function zoomAt(
  state: ViewportState,
  anchor: Point,
  nextScale: number,
): ViewportState {
  const ratio = nextScale / state.scale
  return {
    scale: nextScale,
    panX: anchor.x - (anchor.x - state.panX) * ratio,
    panY: anchor.y - (anchor.y - state.panY) * ratio,
  }
}

export function getScaleBounds(fitScale: number): {
  minScale: number
  maxScale: number
} {
  return {
    minScale: Math.max(0.0001, fitScale * 0.5),
    maxScale: Math.min(8, Math.max(1, fitScale * 12)),
  }
}

export function clampPan(
  state: ViewportState,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
  margin = 64,
): ViewportState {
  const scaledWidth = imageWidth * state.scale
  const scaledHeight = imageHeight * state.scale

  const panX =
    scaledWidth <= viewportWidth
      ? (viewportWidth - scaledWidth) / 2
      : clamp(
          state.panX,
          viewportWidth - scaledWidth - margin,
          margin,
        )

  const panY =
    scaledHeight <= viewportHeight
      ? (viewportHeight - scaledHeight) / 2
      : clamp(
          state.panY,
          viewportHeight - scaledHeight - margin,
          margin,
        )

  return { ...state, panX, panY }
}

export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100
}
