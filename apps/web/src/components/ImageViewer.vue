<script setup lang="ts">
import {
  computed,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue'

import { useImageViewport } from '@/composables/useImageViewport'
import { clamp, roundCoordinate } from '@/lib/viewportMath'
import { resolveAssetUrl } from '@/services/api'
import type { ImageSummary, LocalAnnotation } from '@/types/api'

const props = defineProps<{
  image: ImageSummary
  annotations: LocalAnnotation[]
  selectedId: string | null
  loading?: boolean
}>()

const emit = defineEmits<{
  add: [point: { x: number; y: number }]
  select: [annotationId: string]
}>()

const viewport = useImageViewport()
const stageElement = ref<HTMLElement | null>(null)
const imageElement = ref<HTMLImageElement | null>(null)
const imageLoaded = ref(false)
const imageError = ref('')
const draggingActive = ref(false)
const pinching = ref(false)

interface ClientPoint {
  x: number
  y: number
}

interface DragStart {
  pointerId: number
  clientX: number
  clientY: number
  panX: number
  panY: number
}

interface PinchStart {
  distance: number
  state: {
    scale: number
    panX: number
    panY: number
  }
  anchorImage: { x: number; y: number }
}

const pointers = new Map<number, ClientPoint>()
let dragStart: DragStart | null = null
let pinchStart: PinchStart | null = null
let hasMoved = false
let suppressTap = false

const imageUrl = computed(() => resolveAssetUrl(props.image.imageUrl))
const contentWidth = computed(
  () => viewport.imageSize.width || props.image.width,
)
const contentHeight = computed(
  () => viewport.imageSize.height || props.image.height,
)

const contentStyle = computed<CSSProperties>(() => ({
  width: `${contentWidth.value}px`,
  height: `${contentHeight.value}px`,
  transform: `translate3d(${viewport.state.panX}px, ${viewport.state.panY}px, 0) scale(${viewport.state.scale})`,
}))

const markerScaleStyle = computed<CSSProperties>(() => ({
  transform: `scale(${viewport.inverseScale.value})`,
}))

const stageCursor = computed(() => {
  if (pinching.value) return 'grabbing'
  if (draggingActive.value) return 'grabbing'
  return 'grab'
})

onMounted(() => {
  viewport.attach(stageElement.value)
})

watch(
  () => props.image.id,
  () => {
    imageLoaded.value = false
    imageError.value = ''
    pointers.clear()
    dragStart = null
    pinchStart = null
    hasMoved = false
    suppressTap = false
    draggingActive.value = false
    pinching.value = false
    viewport.reset()
  },
)

function handleImageLoad(): void {
  const image = imageElement.value
  if (!image) return

  imageError.value = ''
  imageLoaded.value = true
  viewport.setImageSize(image.naturalWidth, image.naturalHeight)
}

function handleImageError(): void {
  imageLoaded.value = false
  imageError.value = '图片加载失败，请检查后端文件或稍后重试'
}

function localPoint(event: { clientX: number; clientY: number }): {
  x: number
  y: number
} {
  const rect = stageElement.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function localClientPoint(point: ClientPoint): { x: number; y: number } {
  const rect = stageElement.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: point.x - rect.left,
    y: point.y - rect.top,
  }
}

function firstTwoPointers(): [ClientPoint, ClientPoint] | null {
  const values = [...pointers.values()]
  if (values.length < 2) return null
  return [values[0]!, values[1]!]
}

function pointerMidpoint(
  first: ClientPoint,
  second: ClientPoint,
): ClientPoint {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  }
}

function pointerDistance(first: ClientPoint, second: ClientPoint): number {
  return Math.max(
    1,
    Math.hypot(second.x - first.x, second.y - first.y),
  )
}

function beginPinch(): void {
  const pair = firstTwoPointers()
  if (!pair) return

  const midpointClient = pointerMidpoint(pair[0], pair[1])
  const midpoint = localClientPoint(midpointClient)
  pinchStart = {
    distance: pointerDistance(pair[0], pair[1]),
    state: { ...viewport.state },
    anchorImage: viewport.toImagePoint(midpoint),
  }
  dragStart = null
  suppressTap = true
  hasMoved = true
  pinching.value = true
}

function updatePinch(): void {
  if (!pinchStart) return
  const pair = firstTwoPointers()
  if (!pair) return

  const midpoint = localClientPoint(pointerMidpoint(pair[0], pair[1]))
  const ratio =
    pointerDistance(pair[0], pair[1]) / pinchStart.distance
  const nextScale = clamp(
    pinchStart.state.scale * ratio,
    viewport.scaleBounds.value.minScale,
    viewport.scaleBounds.value.maxScale,
  )

  viewport.setViewport({
    scale: nextScale,
    panX: midpoint.x - pinchStart.anchorImage.x * nextScale,
    panY: midpoint.y - pinchStart.anchorImage.y * nextScale,
  })
}

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return

  const target = event.target as Element | null
  if (target?.closest('[data-interactive]')) return

  event.preventDefault()
  stageElement.value?.focus()
  stageElement.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  })

  if (pointers.size === 1) {
    dragStart = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      panX: viewport.state.panX,
      panY: viewport.state.panY,
    }
    hasMoved = false
    suppressTap = false
    draggingActive.value = false
  } else if (pointers.size === 2) {
    beginPinch()
  }
}

function handlePointerMove(event: PointerEvent): void {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY,
  })

  if (pointers.size >= 2) {
    updatePinch()
    return
  }

  if (!dragStart || dragStart.pointerId !== event.pointerId) return

  const deltaX = event.clientX - dragStart.clientX
  const deltaY = event.clientY - dragStart.clientY
  if (Math.hypot(deltaX, deltaY) >= 4) {
    hasMoved = true
    draggingActive.value = true
  }

  viewport.setPan(dragStart.panX + deltaX, dragStart.panY + deltaY)
}

function finishPointer(event: PointerEvent, allowTap: boolean): void {
  const wasSinglePointer = pointers.size === 1
  const point = localPoint(event)
  pointers.delete(event.pointerId)

  if (
    allowTap &&
    wasSinglePointer &&
    dragStart?.pointerId === event.pointerId &&
    !hasMoved &&
    !suppressTap &&
    imageLoaded.value
  ) {
    const imagePoint = viewport.toImagePoint(point)
    if (
      imagePoint.x >= 0 &&
      imagePoint.y >= 0 &&
      imagePoint.x < contentWidth.value &&
      imagePoint.y < contentHeight.value
    ) {
      emit('add', {
        x: roundCoordinate(imagePoint.x),
        y: roundCoordinate(imagePoint.y),
      })
    }
  }

  if (stageElement.value?.hasPointerCapture(event.pointerId)) {
    stageElement.value.releasePointerCapture(event.pointerId)
  }

  if (pointers.size === 0) {
    dragStart = null
    pinchStart = null
    hasMoved = false
    suppressTap = false
    draggingActive.value = false
    pinching.value = false
    return
  }

  if (pointers.size === 1) {
    const remaining = [...pointers.entries()][0]
    if (remaining) {
      dragStart = {
        pointerId: remaining[0],
        clientX: remaining[1].x,
        clientY: remaining[1].y,
        panX: viewport.state.panX,
        panY: viewport.state.panY,
      }
    }
    pinchStart = null
    pinching.value = false
    hasMoved = true
  }
}

function handlePointerUp(event: PointerEvent): void {
  finishPointer(event, true)
}

function handlePointerCancel(event: PointerEvent): void {
  finishPointer(event, false)
}

function handleWheel(event: WheelEvent): void {
  if (!imageLoaded.value) return

  let delta = event.deltaY
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= 16
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= viewport.viewportSize.height
  }

  viewport.zoomAtPoint(Math.exp(-delta * 0.0015), localPoint(event))
}

function zoomBy(factor: number): void {
  viewport.zoomAtPoint(factor)
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.25)
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(0.8)
  } else if (event.key === '0') {
    event.preventDefault()
    viewport.fit()
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    viewport.panBy(40, 0)
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    viewport.panBy(-40, 0)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    viewport.panBy(0, 40)
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    viewport.panBy(0, -40)
  }
}

function pinStyle(annotation: LocalAnnotation): CSSProperties {
  return {
    '--marker-color': annotation.author.color,
  } as CSSProperties
}

function markerLabel(annotation: LocalAnnotation): string {
  const label = annotation.isNew ? '新标记' : `标记 ${annotation.number}`
  return `${label}，${annotation.author.displayName}：${annotation.note || '尚未填写说明'}`
}
</script>

<template>
  <div
    ref="stageElement"
    class="image-stage"
    :style="{ cursor: stageCursor }"
    tabindex="0"
    role="application"
    aria-label="图片标注画布，拖动平移，滚轮缩放，点击图片添加标记"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel"
    @wheel.prevent="handleWheel"
    @keydown="handleKeydown"
  >
    <div class="image-content" :style="contentStyle">
      <img
        ref="imageElement"
        class="canvas-image"
        :src="imageUrl"
        :alt="image.title"
        draggable="false"
        @load="handleImageLoad"
        @error="handleImageError"
      />

      <button
        v-for="annotation in annotations"
        :key="annotation.id"
        type="button"
        class="marker-anchor"
        :class="{ 'is-selected': annotation.id === selectedId }"
        :style="{ left: `${annotation.x}px`, top: `${annotation.y}px` }"
        data-marker="true"
        data-interactive="true"
        :aria-label="markerLabel(annotation)"
        :title="markerLabel(annotation)"
        @pointerdown.stop
        @click.stop="emit('select', annotation.id)"
      >
        <span class="marker-scale" :style="markerScaleStyle">
          <span
            class="marker-pin"
            :class="{
              'marker-pin-new': annotation.isNew,
              'marker-pin-selected': annotation.id === selectedId,
            }"
            :style="pinStyle(annotation)"
          >
            <span class="marker-number">
              {{ annotation.isNew ? '新' : annotation.number }}
            </span>
          </span>
          <span
            v-if="annotation.id === selectedId"
            class="marker-selection-ring"
            aria-hidden="true"
          ></span>
        </span>
      </button>
    </div>

    <div
      v-if="!annotations.length && imageLoaded && !loading"
      class="canvas-hint"
    >
      <span class="hint-plus">+</span>
      点击图片，落下第一个标记
    </div>

    <div v-if="loading" class="stage-overlay">
      <span class="spinner"></span>
      正在打开图片…
    </div>

    <div v-else-if="imageError" class="stage-overlay stage-error">
      {{ imageError }}
    </div>

    <div
      class="zoom-toolbar"
      data-ui="true"
      data-interactive="true"
      @pointerdown.stop
    >
      <button type="button" aria-label="缩小" @click="zoomBy(0.8)">−</button>
      <span class="zoom-value">{{ viewport.zoomPercent.value }}%</span>
      <button type="button" aria-label="放大" @click="zoomBy(1.25)">＋</button>
      <span class="toolbar-divider"></span>
      <button type="button" class="fit-button" @click="viewport.fit()">
        适应
      </button>
    </div>

    <div class="canvas-help">
      拖动平移 · 滚轮缩放 · 单击标注
    </div>
  </div>
</template>

<style scoped>
.image-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 280px;
  overflow: hidden;
  border-radius: 18px;
  outline: none;
  background-color: #e9ebe5;
  background-image:
    linear-gradient(45deg, rgb(30 41 59 / 2.5%) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(30 41 59 / 2.5%) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(30 41 59 / 2.5%) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(30 41 59 / 2.5%) 75%);
  background-position:
    0 0,
    0 12px,
    12px -12px,
    -12px 0;
  background-size: 24px 24px;
  touch-action: none;
  user-select: none;
}

.image-stage:focus-visible {
  box-shadow: 0 0 0 3px var(--focus-ring);
}

.image-content {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.canvas-image {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
  user-select: none;
}

.marker-anchor {
  position: absolute;
  z-index: 2;
  width: 0;
  height: 0;
  padding: 0;
  overflow: visible;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.marker-anchor.is-selected {
  z-index: 3;
}

.marker-scale {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  transform-origin: 0 0;
}

.marker-pin {
  --marker-color: #2563eb;
  position: absolute;
  top: -44px;
  left: -18px;
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 2px solid rgb(255 255 255 / 92%);
  border-radius: 50%;
  background: var(--marker-color);
  box-shadow:
    0 8px 18px rgb(15 23 42 / 26%),
    0 1px 3px rgb(15 23 42 / 26%);
  color: white;
  transition:
    box-shadow 140ms ease,
    filter 140ms ease;
}

.marker-pin::after {
  position: absolute;
  top: 32px;
  left: 50%;
  width: 10px;
  height: 12px;
  background: var(--marker-color);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  content: '';
  transform: translateX(-50%);
}

.marker-pin::before {
  position: absolute;
  right: 7px;
  bottom: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(255 255 255 / 65%);
  content: '';
}

.marker-pin-selected {
  box-shadow:
    0 0 0 4px rgb(255 255 255 / 72%),
    0 10px 24px rgb(15 23 42 / 32%);
  filter: saturate(1.12);
}

.marker-pin-new {
  border-style: dashed;
}

.marker-number {
  position: relative;
  z-index: 1;
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.marker-selection-ring {
  position: absolute;
  top: -7px;
  left: -7px;
  width: 14px;
  height: 14px;
  border: 2px solid var(--surface);
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 2px var(--accent);
}

.marker-anchor:focus-visible .marker-pin {
  outline: 3px solid var(--focus-ring);
  outline-offset: 4px;
}

.canvas-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  border: 1px solid rgb(255 255 255 / 58%);
  border-radius: 999px;
  background: rgb(17 24 39 / 68%);
  box-shadow: var(--shadow-md);
  color: white;
  font-size: 12px;
  pointer-events: none;
  transform: translate(-50%, 80px);
  backdrop-filter: blur(10px);
}

.hint-plus {
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 50%;
  background: #f6c85f;
  color: #1e293b;
  font-size: 15px;
  font-weight: 800;
}

.stage-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgb(244 245 242 / 82%);
  color: var(--muted);
  font-size: 13px;
  backdrop-filter: blur(4px);
}

.stage-error {
  color: var(--danger);
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgb(30 41 59 / 14%);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.zoom-toolbar {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px;
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: 12px;
  background: rgb(255 255 255 / 88%);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(12px);
}

.zoom-toolbar button {
  min-width: 32px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
}

.zoom-toolbar button:hover {
  background: var(--surface-muted);
}

.zoom-value {
  min-width: 48px;
  color: var(--muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.toolbar-divider {
  width: 1px;
  height: 16px;
  margin: 0 3px;
  background: var(--border);
}

.zoom-toolbar .fit-button {
  padding: 0 8px;
  font-size: 11px;
}

.canvas-help {
  position: absolute;
  bottom: 20px;
  left: 18px;
  z-index: 10;
  color: rgb(30 41 59 / 52%);
  font-size: 10px;
  letter-spacing: 0.02em;
  pointer-events: none;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 720px) {
  .canvas-help {
    display: none;
  }

  .zoom-toolbar {
    right: 10px;
    bottom: 10px;
  }
}
</style>
