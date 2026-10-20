import { readonly, ref } from 'vue'

import { getClientId } from '@/lib/clientIdentity'
import { resolveAssetUrl } from './api'
import type { ImageChangedEvent } from '@/types/api'

type ImageChangedListener = (event: ImageChangedEvent) => void

const connected = ref(false)
const syncVersion = ref(0)
const listeners = new Set<ImageChangedListener>()
let eventSource: EventSource | null = null
let lastEventId = 0
let hasConnected = false

function handleImageChanged(message: MessageEvent<string>): void {
  try {
    const event = JSON.parse(message.data) as ImageChangedEvent
    const eventId = Number(message.lastEventId || event.eventId || 0)
    if (eventId > 0 && eventId <= lastEventId) return
    if (eventId > 0) lastEventId = eventId
    for (const listener of listeners) listener(event)
  } catch {
    // Ignore malformed events and keep the stream alive.
  }
}

export function startRealtime(): void {
  if (eventSource) return

  const url = resolveAssetUrl(
    `/api/v1/events?clientId=${encodeURIComponent(getClientId())}`,
  )
  const source = new EventSource(url)
  eventSource = source

  source.addEventListener('connected', () => {
    connected.value = true
    if (hasConnected) {
      syncVersion.value += 1
    }
    hasConnected = true
  })
  source.addEventListener('image.changed', (event) => {
    handleImageChanged(event as MessageEvent<string>)
  })
  source.onerror = () => {
    connected.value = false
  }
  source.onopen = () => {
    connected.value = true
  }
}

export function stopRealtime(): void {
  eventSource?.close()
  eventSource = null
  connected.value = false
}

export function onImageChanged(
  listener: ImageChangedListener,
): () => void {
  listeners.add(listener)
  startRealtime()
  return () => {
    listeners.delete(listener)
  }
}

export const isRealtimeConnected = readonly(connected)
export const realtimeSyncVersion = readonly(syncVersion)
