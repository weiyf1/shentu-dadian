<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
} from 'vue-router'

import AnnotationPanel from '@/components/AnnotationPanel.vue'
import ImageRail from '@/components/ImageRail.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { formatDimensions } from '@/lib/format'
import {
  ApiRequestError,
  getImage,
  listImages,
  saveBatch,
} from '@/services/api'
import { useOperatorSession } from '@/stores/operatorSession'
import { pushToast } from '@/composables/useToast'
import type {
  Annotation,
  BatchDelete,
  BatchSavePayload,
  BatchUpdate,
  ImageSummary,
  LocalAnnotation,
} from '@/types/api'

const route = useRoute()
const { currentOperator, clearOperator, requestSession } =
  useOperatorSession()

const image = ref<ImageSummary | null>(null)
const annotations = ref<LocalAnnotation[]>([])
const images = ref<ImageSummary[]>([])
const selectedId = ref<string | null>(null)
const serverRevision = ref(1)
const loading = ref(true)
const railLoading = ref(true)
const errorMessage = ref('')
const conflictMessage = ref('')
const saving = ref(false)

const originals = new Map<string, Annotation>()
const deleted = new Map<string, BatchDelete>()

const imageId = computed(() => String(route.params.imageId ?? ''))

const sortedAnnotations = computed(() =>
  [...annotations.value].sort((left, right) => {
    if (left.isNew && !right.isNew) return 1
    if (!left.isNew && right.isNew) return -1
    return left.number - right.number
  }),
)

const dirtyIds = computed(() => {
  const result = new Set<string>()

  for (const annotation of annotations.value) {
    if (annotation.isNew) {
      result.add(annotation.id)
      continue
    }

    const original = originals.get(annotation.id)
    if (original && original.note !== annotation.note) {
      result.add(annotation.id)
    }
  }

  return result
})

const dirtyCount = computed(
  () => dirtyIds.value.size + deleted.size,
)
const isDirty = computed(() => dirtyCount.value > 0)

const saveStatus = computed(() => {
  if (saving.value) return '正在保存…'
  if (conflictMessage.value) return '保存冲突'
  if (isDirty.value) return `有 ${dirtyCount.value} 处未保存修改`
  return '已保存'
})

function applySnapshot(snapshot: Annotation[], keepSelection = true): void {
  originals.clear()
  deleted.clear()
  for (const annotation of snapshot) {
    originals.set(annotation.id, annotation)
  }

  annotations.value = snapshot.map((annotation) => ({
    ...annotation,
    author: { ...annotation.author },
    isNew: false,
  }))

  if (
    keepSelection &&
    selectedId.value &&
    annotations.value.some((item) => item.id === selectedId.value)
  ) {
    return
  }

  selectedId.value = sortedAnnotations.value[0]?.id ?? null
}

async function loadRail(): Promise<void> {
  railLoading.value = true
  try {
    const response = await listImages()
    images.value = response.items
  } catch {
    images.value = []
  } finally {
    railLoading.value = false
  }
}

async function loadImage(): Promise<void> {
  const requestedId = imageId.value
  loading.value = true
  errorMessage.value = ''
  conflictMessage.value = ''

  try {
    const detail = await getImage(requestedId)
    if (imageId.value !== requestedId) return

    image.value = detail.image
    serverRevision.value = detail.image.revision
    selectedId.value = null
    applySnapshot(detail.annotations)
  } catch (error) {
    if (imageId.value !== requestedId) return
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : '图片加载失败，请检查后端服务'
  } finally {
    if (imageId.value === requestedId) {
      loading.value = false
    }
  }
}

function addAnnotation(point: { x: number; y: number }): void {
  if (!currentOperator.value) {
    requestSession()
    return
  }

  if (annotations.value.length >= 50) {
    pushToast('每张图最多添加 50 个标记', 'error')
    return
  }

  const now = new Date().toISOString()
  const annotation: LocalAnnotation = {
    id: crypto.randomUUID(),
    number: 0,
    x: point.x,
    y: point.y,
    note: '',
    author: {
      id: currentOperator.value.id,
      displayName: currentOperator.value.displayName,
      color: currentOperator.value.color,
    },
    version: 0,
    createdAt: now,
    updatedAt: now,
    isNew: true,
  }

  annotations.value.push(annotation)
  selectedId.value = annotation.id
  conflictMessage.value = ''
}

function updateNote(annotationId: string, note: string): void {
  const annotation = annotations.value.find(
    (item) => item.id === annotationId,
  )
  if (!annotation) return
  annotation.note = note
  conflictMessage.value = ''
}

function deleteLocalAnnotation(annotationId: string): void {
  const annotation = annotations.value.find(
    (item) => item.id === annotationId,
  )
  if (!annotation) return

  if (!annotation.isNew) {
    deleted.set(annotation.id, {
      id: annotation.id,
      version: annotation.version,
    })
  }

  annotations.value = annotations.value.filter(
    (item) => item.id !== annotationId,
  )
  selectedId.value = sortedAnnotations.value[0]?.id ?? null
  conflictMessage.value = ''
}

function buildPayload(): BatchSavePayload | null {
  const invalid = annotations.value.find((annotation) => {
    const note = annotation.note.trim()
    return note.length === 0 || note.length > 200
  })

  if (invalid) {
    selectedId.value = invalid.id
    pushToast(
      invalid.note.trim()
        ? '标记说明不能超过 200 字'
        : '请先填写标记说明再保存',
      'error',
    )
    return null
  }

  const creates = annotations.value
    .filter((annotation) => annotation.isNew)
    .map((annotation) => ({
      id: annotation.id,
      x: annotation.x,
      y: annotation.y,
      note: annotation.note.trim(),
    }))

  const updates: BatchUpdate[] = []
  for (const annotation of annotations.value) {
    if (annotation.isNew) continue
    const original = originals.get(annotation.id)
    if (original && original.note !== annotation.note.trim()) {
      updates.push({
        id: annotation.id,
        version: annotation.version,
        note: annotation.note.trim(),
      })
    }
  }

  const deletes = [...deleted.values()]
  if (creates.length + updates.length + deletes.length === 0) {
    return null
  }

  return {
    baseRevision: serverRevision.value,
    creates,
    updates,
    deletes,
  }
}

async function save(): Promise<void> {
  const currentImage = image.value
  if (!currentImage || saving.value) return

  if (!currentOperator.value) {
    requestSession()
    return
  }

  const payload = buildPayload()
  if (!payload) {
    if (!isDirty.value) {
      pushToast('当前没有需要保存的修改', 'info')
    }
    return
  }

  saving.value = true
  conflictMessage.value = ''

  try {
    const response = await saveBatch(currentImage.id, payload)
    serverRevision.value = response.imageRevision
    image.value = {
      ...currentImage,
      revision: response.imageRevision,
      annotationCount: response.annotations.length,
      lastAnnotatedAt: response.savedAt,
    }
    const keptSelection = selectedId.value
    applySnapshot(response.annotations)
    if (
      keptSelection &&
      response.annotations.some((item) => item.id === keptSelection)
    ) {
      selectedId.value = keptSelection
    }

    const currentRailImage = images.value.find(
      (item) => item.id === currentImage.id,
    )
    if (currentRailImage) {
      currentRailImage.revision = response.imageRevision
      currentRailImage.annotationCount = response.annotations.length
      currentRailImage.lastAnnotatedAt = response.savedAt
    }

    pushToast('标记已保存', 'success')
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (
        error.code === 'IMAGE_REVISION_CONFLICT' ||
        error.code === 'ANNOTATION_CONFLICT'
      ) {
        conflictMessage.value =
          error.code === 'IMAGE_REVISION_CONFLICT'
            ? '这张图已被其他同事更新。你的草稿仍在，请重新加载最新标记后再处理。'
            : '有标记已被其他同事修改。你的草稿仍在，请重新加载最新标记后再处理。'
        pushToast('保存冲突，本地草稿已保留', 'error')
        return
      }

      if (error.code === 'OPERATOR_REQUIRED') {
        clearOperator()
        requestSession()
        return
      }

      pushToast(error.message, 'error')
      return
    }

    pushToast('保存失败，请检查后端服务', 'error')
  } finally {
    saving.value = false
  }
}

async function reloadLatest(): Promise<void> {
  if (
    isDirty.value &&
    !window.confirm(
      '重新加载会放弃当前未保存的草稿，确定继续吗？',
    )
  ) {
    return
  }

  selectedId.value = null
  await loadImage()
}

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (
    (event.metaKey || event.ctrlKey) &&
    event.key.toLowerCase() === 's'
  ) {
    event.preventDefault()
    void save()
  }
}

onBeforeRouteLeave(() => {
  if (!isDirty.value) return true
  return window.confirm('有未保存的标记修改，确定离开吗？')
})

onBeforeRouteUpdate((to, from) => {
  if (to.params.imageId === from.params.imageId) return true
  if (!isDirty.value) return true
  return window.confirm('切换图片会丢失未保存修改，确定继续吗？')
})

watch(
  imageId,
  () => {
    selectedId.value = null
    annotations.value = []
    image.value = null
    void loadImage()
  },
  { immediate: true },
)

onMounted(() => {
  void loadRail()
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<template>
  <main class="image-page">
    <ImageRail
      class="workspace-rail"
      :images="images"
      :current-id="imageId"
      :loading="railLoading"
    />

    <section class="viewer-column">
      <header class="workspace-toolbar">
        <RouterLink to="/" class="back-link">← 图片库</RouterLink>
        <div class="workspace-title">
          <span class="workspace-kicker">REVIEW CANVAS</span>
          <h1>{{ image?.title ?? '正在打开图片' }}</h1>
        </div>
        <div v-if="image" class="image-metadata">
          {{ formatDimensions(image.width, image.height) }}
          <span>·</span>
          {{ annotations.length }} 个标记
        </div>

        <div class="save-area">
          <span
            class="save-status"
            :class="{
              'is-dirty': isDirty,
              'is-conflict': conflictMessage,
            }"
          >
            <i></i>
            {{ saveStatus }}
          </span>
          <button
            type="button"
            class="button button-primary save-button"
            :disabled="!isDirty || saving || loading"
            @click="save"
          >
            {{ saving ? '保存中…' : '保存修改' }}
          </button>
        </div>
      </header>

      <div v-if="conflictMessage" class="conflict-banner" role="alert">
        <span class="conflict-icon">!</span>
        <div>
          <strong>保存冲突</strong>
          <p>{{ conflictMessage }}</p>
        </div>
        <button type="button" class="button button-ghost" @click="reloadLatest">
          加载最新版本
        </button>
      </div>

      <div v-if="errorMessage" class="page-error">
        <strong>无法打开图片</strong>
        <p>{{ errorMessage }}</p>
        <button type="button" class="button button-primary" @click="loadImage">
          重试
        </button>
      </div>

      <div v-else-if="image" class="viewer-surface">
        <ImageViewer
          :image="image"
          :annotations="sortedAnnotations"
          :selected-id="selectedId"
          :loading="loading"
          @add="addAnnotation"
          @select="selectedId = $event"
        />
      </div>

      <div v-else class="viewer-loading">
        <span class="spinner"></span>
        正在打开图片…
      </div>
    </section>

    <AnnotationPanel
      v-if="image"
      class="workspace-panel"
      :annotations="sortedAnnotations"
      :selected-id="selectedId"
      :dirty-ids="dirtyIds"
      :max-count="50"
      @select="selectedId = $event"
      @update-note="updateNote"
      @delete="deleteLocalAnnotation"
    />
  </main>
</template>

<style scoped>
.image-page {
  display: grid;
  height: calc(100vh - var(--header-height));
  min-height: 0;
  padding: 14px 18px 18px;
  gap: 12px;
  grid-template-columns: 212px minmax(0, 1fr) 334px;
}

.workspace-rail {
  min-height: 0;
}

.viewer-column {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.workspace-toolbar {
  display: flex;
  min-height: 58px;
  padding: 9px 13px;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}

.back-link {
  flex: none;
  padding: 7px 9px;
  border-radius: 8px;
  color: var(--muted);
  font-size: 10px;
  font-weight: 650;
  text-decoration: none;
}

.back-link:hover {
  background: var(--surface-muted);
  color: var(--text);
}

.workspace-title {
  min-width: 0;
}

.workspace-kicker {
  color: var(--muted);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.workspace-title h1 {
  margin: 3px 0 0;
  overflow: hidden;
  font-size: 16px;
  letter-spacing: -0.025em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-metadata {
  display: flex;
  gap: 5px;
  margin-left: 8px;
  color: var(--muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.save-area {
  display: flex;
  margin-left: auto;
  align-items: center;
  gap: 12px;
}

.save-status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 9px;
  white-space: nowrap;
}

.save-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}

.save-status.is-dirty {
  color: #a16207;
}

.save-status.is-dirty i {
  background: #eab308;
}

.save-status.is-conflict {
  color: var(--danger);
}

.save-status.is-conflict i {
  background: var(--danger);
}

.save-button {
  min-width: 96px;
}

.viewer-surface,
.viewer-loading {
  min-height: 0;
  flex: 1;
}

.viewer-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  color: var(--muted);
  font-size: 12px;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 700ms linear infinite;
}

.conflict-banner {
  display: flex;
  padding: 12px 14px;
  align-items: center;
  gap: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 26%, var(--border));
  border-radius: 12px;
  background: var(--danger-soft);
}

.conflict-icon {
  display: grid;
  width: 26px;
  height: 26px;
  flex: none;
  place-items: center;
  border-radius: 50%;
  background: var(--danger);
  color: white;
  font-size: 13px;
  font-weight: 800;
}

.conflict-banner div {
  min-width: 0;
  flex: 1;
}

.conflict-banner strong {
  color: #991b1b;
  font-size: 11px;
}

.conflict-banner p {
  margin: 3px 0 0;
  color: #7f1d1d;
  font-size: 10px;
  line-height: 1.5;
}

.page-error {
  display: flex;
  flex: 1;
  padding: 30px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  text-align: center;
}

.page-error strong {
  font-size: 18px;
}

.page-error p {
  margin: 8px 0 18px;
  color: var(--muted);
  font-size: 12px;
}

.workspace-panel {
  min-height: 0;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .image-page {
    grid-template-columns: minmax(0, 1fr) 330px;
  }

  .workspace-rail {
    display: none;
  }
}

@media (max-width: 880px) {
  .image-page {
    height: auto;
    min-height: calc(100vh - var(--header-height));
    padding: 10px;
    grid-template-columns: 1fr;
  }

  .viewer-surface {
    height: 58vh;
  }

  .workspace-panel {
    max-height: 560px;
  }

  .workspace-toolbar {
    flex-wrap: wrap;
  }

  .image-metadata {
    display: none;
  }

  .save-area {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
