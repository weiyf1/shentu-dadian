import { describe, expect, it } from 'vitest'

import {
  clamp,
  clampPan,
  fitViewport,
  getScaleBounds,
  imageToViewport,
  viewportToImage,
  zoomAt,
  type ViewportState,
} from './viewportMath'

describe('viewportMath', () => {
  it('round-trips image and viewport coordinates', () => {
    const states: ViewportState[] = [
      { scale: 0.5, panX: 24, panY: 40 },
      { scale: 1, panX: -120, panY: 8 },
      { scale: 3.75, panX: -900, panY: -420 },
    ]

    for (const state of states) {
      for (const point of [
        { x: 0, y: 0 },
        { x: 842.5, y: 310.25 },
        { x: 1599.99, y: 899.5 },
      ]) {
        const roundTrip = viewportToImage(
          imageToViewport(point, state),
          state,
        )
        expect(roundTrip.x).toBeCloseTo(point.x, 8)
        expect(roundTrip.y).toBeCloseTo(point.y, 8)
      }
    }
  })

  it('fits and centers a 1920 by 1080 image in a 1000 by 700 viewport', () => {
    const result = fitViewport(1000, 700, 1920, 1080, 24)

    expect(result.fitScale).toBeCloseTo(952 / 1920, 10)
    expect(result.scale).toBeCloseTo(952 / 1920, 10)
    expect(result.panX).toBeCloseTo(24, 10)
    expect(result.panY).toBeCloseTo(82.25, 10)
  })

  it('keeps the image point under the zoom anchor fixed', () => {
    const initial: ViewportState = {
      scale: 952 / 1920,
      panX: 24,
      panY: 82.25,
    }
    const anchor = { x: 500, y: 350 }
    const anchorImage = viewportToImage(anchor, initial)

    const next = zoomAt(initial, anchor, 0.74375)
    const anchorAfterZoom = imageToViewport(anchorImage, next)

    expect(anchorImage.x).toBeCloseTo(960, 8)
    expect(anchorImage.y).toBeCloseTo(540, 8)
    expect(next.panX).toBeCloseTo(-214, 8)
    expect(next.panY).toBeCloseTo(-51.625, 8)
    expect(anchorAfterZoom.x).toBeCloseTo(anchor.x, 8)
    expect(anchorAfterZoom.y).toBeCloseTo(anchor.y, 8)
  })

  it('clamps zoom to the configured scale bounds', () => {
    const bounds = getScaleBounds(0.5)
    expect(bounds.minScale).toBe(0.25)
    expect(bounds.maxScale).toBe(6)
    expect(clamp(12, bounds.minScale, bounds.maxScale)).toBe(6)
  })

  it('centers an image smaller than the viewport and limits a larger one', () => {
    const centered = clampPan(
      { scale: 0.5, panX: 999, panY: -400 },
      1000,
      700,
      1000,
      800,
    )
    expect(centered.panX).toBe(250)
    expect(centered.panY).toBe(150)

    const limited = clampPan(
      { scale: 2, panX: 5000, panY: -5000 },
      1000,
      700,
      1000,
      800,
    )
    expect(limited.panX).toBe(64)
    expect(limited.panY).toBe(700 - 1600 - 64)
  })
})
