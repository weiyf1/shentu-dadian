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
  useRouter,
} from 'vue-router'

import AnnotationPanel from '@/components/AnnotationPanel.vue'
import ImageRail from '@/components/ImageRail.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { formatDimensions } from '@/lib/format'
import { getClientId } from '@/lib/clientIdentity'
import {
  ApiRequestError,
  deleteAnnotation,
  deleteImage,
  getImage,
  listImages,
  saveBatch,
} from '@/services/api'
import {
  isRealtimeConnected,
  onImageChanged,
  onImageDeleted,
  realtimeSyncVersion,
} from '@/services/realtime'
import { useOperatorSession } from '@/stores/operatorSession'
import { pushToast } from '@/composables/useToast'
import type {
  AnnotationConflict,
  Annotation,
  BatchSavePayload,
  BatchUpdate,
  ImageChangedEvent,
  ImageSummary,
  LocalAnnotation,
} from '@/types/api'

const route = useRoute()
const router = useRouter()
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
const deleting = ref(false)
const deletingAnnotationId = ref<string | null>(null)
const remoteConflicts = ref<Map<string, AnnotationConflict>>(new Map())

const originals = new Map<string, Annotation>()
let remoteRefreshSequence = 0
let stopRealtimeListener: (() => void) | undefined
let stopDeletedListener: (() => void) | undefined
let pollTimer: number | undefined
let bypassUnsavedGuard = false

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
  () => dirtyIds.value.size,
)
const isDirty = computed(() => dirtyCount.value > 0)
const hasRemoteConflicts = computed(
  () => remoteConflicts.value.size > 0,
)
const canDeleteImage = computed(
  () =>
    Boolean(
      image.value?.uploadedBy &&
        image.value.uploadedBy.id === currentOperator.value?.id,
    ),
)

const saveStatus = computed(() => {
  if (saving.value) return '正在保存…'
  if (hasRemoteConflicts.value || conflictMessage.value) return '保存冲突'
  if (isDirty.value) return `有 ${dirtyCount.value} 处未保存修改`
  return '已保存'
})

function applySnapshot(snapshot: Annotation[], keepSelection = true): void {
  originals.clear()
  remoteConflicts.value = new Map()
  conflictMessage.value = ''
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

function refreshConflictMessage(): void {
  if (remoteConflicts.value.size > 0) {
    conflictMessage.value = `有 ${remoteConflicts.value.size} 个标记与远端修改冲突，请在右侧面板选择保留版本。`
  } else {
    conflictMessage.value = ''
  }
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

function cloneServerAnnotation(annotation: Annotation): LocalAnnotation {
  return {
    ...annotation,
    author: { ...annotation.author },
    isNew: false,
  }
}

function mergeRemoteSnapshot(
  snapshot: Annotation[],
  remoteImage: ImageSummary,
  actorName?: string,
): void {
  const serverMap = new Map(snapshot.map((annotation) => [annotation.id, annotation]))
  const nextLocal: LocalAnnotation[] = []
  const nextConflicts = new Map(remoteConflicts.value)
  const seen = new Set<string>()

  for (const local of annotations.value) {
    if (local.isNew) {
      nextLocal.push(local)
      continue
    }

    const server = serverMap.get(local.id)
    const base = originals.get(local.id)
    const localDirty = !base || base.note !== local.note

    if (server) {
      seen.add(server.id)
      if (!localDirty) {
        nextLocal.push(cloneServerAnnotation(server))
        originals.set(server.id, server)
        nextConflicts.delete(server.id)
      } else if (!base || server.version !== base.version) {
        nextLocal.push(local)
        nextConflicts.set(server.id, {
          kind: 'updated',
          remote: server,
        })
      } else {
        nextLocal.push(local)
        nextConflicts.delete(server.id)
      }
      continue
    }

    if (localDirty) {
      nextLocal.push(local)
      nextConflicts.set(local.id, {
        kind: 'deleted',
        remote: null,
      })
    } else {
      originals.delete(local.id)
      nextConflicts.delete(local.id)
    }
  }

  for (const server of snapshot) {
    if (seen.has(server.id)) continue

    originals.set(server.id, server)
    nextLocal.push(cloneServerAnnotation(server))
    nextConflicts.delete(server.id)
  }

  annotations.value = nextLocal
  remoteConflicts.value = nextConflicts
  serverRevision.value = remoteImage.revision
  image.value = {
    ...remoteImage,
    annotationCount: snapshot.length,
  }
  refreshConflictMessage()

  if (
    selectedId.value &&
    !nextLocal.some((annotation) => annotation.id === selectedId.value)
  ) {
    selectedId.value = sortedAnnotations.value[0]?.id ?? null
  }

  const railImage = images.value.find((item) => item.id === remoteImage.id)
  if (railImage) {
    railImage.revision = remoteImage.revision
    railImage.annotationCount = remoteImage.annotationCount
    railImage.lastAnnotatedAt = remoteImage.lastAnnotatedAt
  }

  if (nextConflicts.size > 0) {
    pushToast('远端修改与本地草稿存在冲突', 'error')
  } else if (actorName) {
    pushToast(`已同步 ${actorName} 的修改`, 'success')
  }
}

async function refreshFromRemote(
  actorName?: string,
  announce = true,
): Promise<void> {
  const requestedId = imageId.value
  if (!requestedId) return

  const sequence = ++remoteRefreshSequence
  try {
    const detail = await getImage(requestedId)
    if (
      sequence !== remoteRefreshSequence ||
      imageId.value !== requestedId
    ) {
      return
    }
    mergeRemoteSnapshot(detail.annotations, detail.image, actorName)
  } catch {
    if (announce) {
      pushToast('实时同步失败，稍后会自动重试', 'error')
    }
  }
}

function addAnnotation(point: { x: number; y: number }): void {
  if (!currentOperator.value) {
    requestSession()
    return
  }

  if (hasRemoteConflicts.value) {
    pushToast('请先在右侧处理保存冲突', 'error')
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
  if (!hasRemoteConflicts.value) conflictMessage.value = ''
}

function updateNote(annotationId: string, note: string): void {
  const annotation = annotations.value.find(
    (item) => item.id === annotationId,
  )
  if (!annotation) return
  if (
    !annotation.isNew &&
    annotation.author.id !== currentOperator.value?.id
  ) {
    pushToast('只能修改自己创建的标记说明', 'error')
    return
  }
  annotation.note = note
  if (!hasRemoteConflicts.value) conflictMessage.value = ''
}

async function deleteLocalAnnotation(annotationId: string): Promise<void> {
  const annotation = annotations.value.find(
    (item) => item.id === annotationId,
  )
  if (!annotation) return
  if (
    !annotation.isNew &&
    annotation.author.id !== currentOperator.value?.id
  ) {
    pushToast('只能删除自己创建的标记', 'error')
    return
  }

  if (annotation.isNew) {
    annotations.value = annotations.value.filter(
      (item) => item.id !== annotationId,
    )
    selectedId.value = sortedAnnotations.value[0]?.id ?? null
    if (!hasRemoteConflicts.value) conflictMessage.value = ''
    return
  }

  if (deletingAnnotationId.value) return
  deletingAnnotationId.value = annotationId

  try {
    const response = await deleteAnnotation(
      annotationId,
      annotation.version,
    )
    annotations.value = annotations.value.filter(
      (item) => item.id !== annotationId,
    )
    originals.delete(annotationId)
    serverRevision.value = response.imageRevision
    if (image.value) {
      image.value = {
        ...image.value,
        revision: response.imageRevision,
        annotationCount: annotations.value.length,
        lastAnnotatedAt: new Date().toISOString(),
      }
    }
    const railImage = images.value.find(
      (item) => item.id === image.value?.id,
    )
    if (railImage) {
      railImage.revision = response.imageRevision
      railImage.annotationCount = annotations.value.length
      railImage.lastAnnotatedAt = new Date().toISOString()
    }

    const nextConflicts = new Map(remoteConflicts.value)
    nextConflicts.delete(annotationId)
    remoteConflicts.value = nextConflicts
    refreshConflictMessage()
    selectedId.value = sortedAnnotations.value[0]?.id ?? null
    pushToast('标记已删除', 'success')
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (
        error.code === 'ANNOTATION_CONFLICT' ||
        error.code === 'ANNOTATION_DELETED'
      ) {
        pushToast(error.message, 'error')
        void refreshFromRemote(undefined, false)
        return
      }

      pushToast(error.message, 'error')
      return
    }

    pushToast('删除标记失败，请稍后重试', 'error')
  } finally {
    deletingAnnotationId.value = null
  }
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

  if (creates.length + updates.length === 0) {
    return null
  }

  return {
    observedRevision: serverRevision.value,
    creates,
    updates,
    deletes: [],
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

    pushToast(
      response.concurrentChanges
        ? '已合并其他同事的修改并保存'
        : '标记已保存',
      'success',
    )
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (
        error.code === 'ANNOTATION_CONFLICT' ||
        error.code === 'ANNOTATION_DELETED' ||
        error.code === 'IMAGE_REVISION_CONFLICT'
      ) {
        conflictMessage.value =
          error.code === 'ANNOTATION_DELETED'
            ? '有标记已被其他同事删除。你的草稿仍在，请选择恢复远端版本或重新添加草稿。'
            : '有标记已被其他同事修改。你的草稿仍在，请选择使用远端说明或保留本地草稿。'
        pushToast('保存冲突，本地草稿已保留', 'error')
        void refreshFromRemote(undefined, false)
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

async function deleteCurrentImage(): Promise<void> {
  const currentImage = image.value
  if (!currentImage || !canDeleteImage.value || deleting.value) return

  const suffix = isDirty.value ? '当前未保存的草稿也会丢失。' : ''
  if (
    !window.confirm(
      `确定删除图片“${currentImage.title}”及其全部 ${annotations.value.length} 个标记吗？${suffix}`,
    )
  ) {
    return
  }

  deleting.value = true
  try {
    await deleteImage(currentImage.id)
    bypassUnsavedGuard = true
    pushToast('图片已删除', 'success')
    await router.replace('/')
  } catch (error) {
    pushToast(
      error instanceof ApiRequestError
        ? error.message
        : '图片删除失败，请稍后重试',
      'error',
    )
  } finally {
    deleting.value = false
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

function resolveWithRemote(annotationId: string): void {
  const conflict = remoteConflicts.value.get(annotationId)
  if (!conflict) return

  if (conflict.kind === 'updated' && conflict.remote) {
    const index = annotations.value.findIndex(
      (annotation) => annotation.id === annotationId,
    )
    if (index >= 0) {
      annotations.value[index] = cloneServerAnnotation(conflict.remote)
    }
    originals.set(annotationId, conflict.remote)
  } else {
    annotations.value = annotations.value.filter(
      (annotation) => annotation.id !== annotationId,
    )
    originals.delete(annotationId)
  }

  const nextConflicts = new Map(remoteConflicts.value)
  nextConflicts.delete(annotationId)
  remoteConflicts.value = nextConflicts
  refreshConflictMessage()

  if (!annotations.value.some((annotation) => annotation.id === selectedId.value)) {
    selectedId.value = sortedAnnotations.value[0]?.id ?? null
  }
}

function keepLocalConflict(annotationId: string): void {
  const conflict = remoteConflicts.value.get(annotationId)
  if (!conflict) return

  const annotation = annotations.value.find(
    (item) => item.id === annotationId,
  )

  if (conflict.kind === 'updated' && conflict.remote && annotation) {
    originals.set(annotationId, conflict.remote)
    annotation.version = conflict.remote.version
    annotation.updatedAt = conflict.remote.updatedAt
  } else if (annotation) {
    const now = new Date().toISOString()
    const operator = currentOperator.value
    const replacement: LocalAnnotation = {
      ...annotation,
      id: crypto.randomUUID(),
      number: 0,
      version: 0,
      createdAt: now,
      updatedAt: now,
      author: operator
        ? {
            id: operator.id,
            displayName: operator.displayName,
            color: operator.color,
          }
        : annotation.author,
      isNew: true,
    }
    annotations.value = annotations.value.map((item) =>
      item.id === annotationId ? replacement : item,
    )
    originals.delete(annotationId)
    selectedId.value = replacement.id
  }

  const nextConflicts = new Map(remoteConflicts.value)
  nextConflicts.delete(annotationId)
  remoteConflicts.value = nextConflicts
  refreshConflictMessage()
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

function handleRealtimeEvent(event: ImageChangedEvent): void {
  if (
    event.imageId !== imageId.value ||
    event.sourceClientId === getClientId()
  ) {
    return
  }

  void refreshFromRemote(event.actor.displayName)
}

function handleImageDeletedEvent(event: {
  imageId: string
  actor: { displayName: string }
  sourceClientId: string | null
}): void {
  if (
    event.imageId !== imageId.value ||
    event.sourceClientId === getClientId()
  ) {
    return
  }

  bypassUnsavedGuard = true
  pushToast(`${event.actor.displayName} 删除了这张图片`, 'info')
  void router.replace('/')
}

function handleWindowFocus(): void {
  if (!isRealtimeConnected.value && image.value) {
    void refreshFromRemote(undefined, false)
  }
}

onBeforeRouteLeave(() => {
  if (bypassUnsavedGuard) return true
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
    remoteRefreshSequence += 1
    selectedId.value = null
    annotations.value = []
    image.value = null
    remoteConflicts.value = new Map()
    void loadImage()
  },
  { immediate: true },
)

watch(realtimeSyncVersion, () => {
  if (image.value) {
    void refreshFromRemote(undefined, false)
  }
})

onMounted(() => {
  void loadRail()
  stopRealtimeListener = onImageChanged(handleRealtimeEvent)
  stopDeletedListener = onImageDeleted(handleImageDeletedEvent)
  pollTimer = window.setInterval(() => {
    if (!isRealtimeConnected.value && image.value) {
      void refreshFromRemote(undefined, false)
    }
  }, 8_000)
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('focus', handleWindowFocus)
})

onBeforeUnmount(() => {
  stopRealtimeListener?.()
  stopDeletedListener?.()
  window.clearInterval(pollTimer)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('focus', handleWindowFocus)
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
          <span>·</span>
          上传者 {{ image.uploadedBy?.displayName ?? '系统导入' }}
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
            v-if="canDeleteImage"
            type="button"
            class="button button-ghost delete-image-button"
            :disabled="deleting || saving"
            @click="deleteCurrentImage"
          >
            {{ deleting ? '删除中…' : '删除图片' }}
          </button>
          <button
            type="button"
            class="button button-primary save-button"
            :disabled="
              !isDirty || saving || loading || hasRemoteConflicts
            "
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
      :conflicts="remoteConflicts"
      :current-operator-id="currentOperator?.id ?? ''"
      :max-count="50"
      @select="selectedId = $event"
      @update-note="updateNote"
      @delete="deleteLocalAnnotation"
      @resolve-remote="resolveWithRemote"
      @keep-local="keepLocalConflict"
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

.delete-image-button {
  color: var(--danger);
}

.delete-image-button:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--danger) 25%, var(--border));
  background: var(--danger-soft);
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
