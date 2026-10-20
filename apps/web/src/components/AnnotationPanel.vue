<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { formatFullDateTime } from '@/lib/format'
import type {
  AnnotationConflict,
  LocalAnnotation,
} from '@/types/api'

const props = defineProps<{
  annotations: LocalAnnotation[]
  selectedId: string | null
  dirtyIds: Set<string>
  conflicts: Map<string, AnnotationConflict>
  currentOperatorId: string
  maxCount?: number
}>()

const emit = defineEmits<{
  select: [annotationId: string]
  updateNote: [annotationId: string, note: string]
  delete: [annotationId: string]
  resolveRemote: [annotationId: string]
  keepLocal: [annotationId: string]
}>()

const listElement = ref<HTMLElement | null>(null)
const editorElement = ref<HTMLTextAreaElement | null>(null)

const selected = computed(
  () =>
    props.annotations.find((item) => item.id === props.selectedId) ?? null,
)

const selectedIsDirty = computed(
  () => Boolean(props.selectedId && props.dirtyIds.has(props.selectedId)),
)
const selectedConflict = computed(() =>
  props.selectedId ? props.conflicts.get(props.selectedId) : undefined,
)
const canDeleteSelected = computed(
  () =>
    Boolean(
      selected.value &&
        (selected.value.isNew ||
          selected.value.author.id === props.currentOperatorId),
    ),
)

watch(
  () => props.selectedId,
  async (annotationId) => {
    if (!annotationId) return

    await nextTick()
    listElement.value
      ?.querySelector<HTMLElement>(
        `[data-annotation-id="${annotationId}"]`,
      )
      ?.scrollIntoView({ block: 'nearest' })

    if (selected.value) {
      editorElement.value?.focus()
      const length = editorElement.value?.value.length ?? 0
      editorElement.value?.setSelectionRange(length, length)
    }
  },
)

function noteInput(event: Event): void {
  if (!selected.value) return
  emit(
    'updateNote',
    selected.value.id,
    (event.target as HTMLTextAreaElement).value,
  )
}

function requestDelete(): void {
  if (!selected.value) return
  if (!canDeleteSelected.value) {
    return
  }
  if (selected.value.isNew) {
    emit('delete', selected.value.id)
    return
  }

  const label = `标记 #${selected.value.number}`
  if (window.confirm(`确定删除${label}吗？`)) {
    emit('delete', selected.value.id)
  }
}

function annotationNumber(annotation: LocalAnnotation): string {
  return annotation.isNew ? '新' : String(annotation.number)
}
</script>

<template>
  <aside class="annotation-panel" aria-label="标记列表">
    <header class="panel-heading">
      <div>
        <span class="panel-kicker">REVIEW NOTES</span>
        <h2>标记</h2>
      </div>
      <span class="count-pill">
        {{ annotations.length }}<i>/{{ maxCount ?? 50 }}</i>
      </span>
    </header>

    <div ref="listElement" class="annotation-list">
      <button
        v-for="annotation in annotations"
        :key="annotation.id"
        type="button"
        class="annotation-item"
        :class="{
          'is-selected': annotation.id === selectedId,
          'is-empty-note': !annotation.note.trim(),
          'has-conflict': conflicts.has(annotation.id),
        }"
        :data-annotation-id="annotation.id"
        :aria-current="annotation.id === selectedId ? 'true' : undefined"
        @click="emit('select', annotation.id)"
      >
        <span
          class="list-number"
          :style="{ backgroundColor: annotation.author.color }"
        >
          {{ annotationNumber(annotation) }}
        </span>
        <span class="annotation-copy">
          <span class="annotation-meta">
            <strong>{{ annotation.author.displayName }}</strong>
            <span>{{ formatFullDateTime(annotation.createdAt) }}</span>
            <span
              v-if="dirtyIds.has(annotation.id)"
              class="dirty-badge"
            >
              未保存
            </span>
            <span
              v-if="conflicts.has(annotation.id)"
              class="conflict-badge"
            >
              冲突
            </span>
          </span>
          <span class="annotation-note-preview">
            {{ annotation.note.trim() || '尚未填写说明' }}
          </span>
        </span>
      </button>

      <div v-if="!annotations.length" class="empty-list">
        <span class="empty-list-mark">+</span>
        <strong>还没有标记</strong>
        <p>点击左侧图片上的任意位置，添加第一条审图说明。</p>
      </div>
    </div>

    <section v-if="selected" class="annotation-editor">
      <div class="editor-heading">
        <div>
          <span class="editor-eyebrow">
            {{ selected.isNew ? '新标记' : `标记 #${selected.number}` }}
          </span>
          <span class="editor-author">
            <i :style="{ backgroundColor: selected.author.color }"></i>
            {{ selected.author.displayName }}
          </span>
        </div>
        <span v-if="selectedIsDirty" class="dirty-badge">未保存</span>
      </div>

      <label class="field-label" :for="`note-${selected.id}`">
        标记说明
      </label>

      <div v-if="selectedConflict" class="remote-conflict">
        <div class="remote-conflict-heading">
          <strong>
            {{
              selectedConflict.kind === 'deleted'
                ? '远端已删除此标记'
                : '远端已修改此标记'
            }}
          </strong>
          <span>需要选择保留哪一份</span>
        </div>
        <p v-if="selectedConflict.remote" class="remote-note">
          远端说明：{{ selectedConflict.remote.note }}
        </p>
        <p v-else class="remote-note">
          另一位同事已经删除了这个标记，你的草稿仍保留在这里。
        </p>
        <div class="remote-conflict-actions">
          <button
            type="button"
            class="button button-ghost button-small"
            @click="emit('resolveRemote', selected.id)"
          >
            {{ selectedConflict.kind === 'deleted' ? '确认删除' : '使用远端说明' }}
          </button>
          <button
            type="button"
            class="button button-primary button-small"
            @click="emit('keepLocal', selected.id)"
          >
            {{
              selectedConflict.kind === 'deleted'
                ? '重新添加我的草稿'
                : '保留我的草稿'
            }}
          </button>
        </div>
      </div>

      <textarea
        :id="`note-${selected.id}`"
        ref="editorElement"
        class="text-area"
        :value="selected.note"
        rows="4"
        maxlength="200"
        placeholder="描述这里的问题，例如：价格字体偏小，需要放大"
        @input="noteInput"
      ></textarea>

      <div class="editor-footer">
        <span
          class="coordinate-label"
          :title="`原始像素坐标：${selected.x}, ${selected.y}`"
        >
          X {{ Math.round(selected.x) }} · Y {{ Math.round(selected.y) }}
        </span>
        <span class="character-count">{{ selected.note.length }}/200</span>
      </div>

      <p v-if="!selected.note.trim()" class="note-warning">
        保存前需要填写说明。
      </p>

      <button
        v-if="canDeleteSelected"
        type="button"
        class="delete-button"
        @click="requestDelete"
      >
        删除此标记
      </button>
      <p v-else class="delete-restriction">
        只能删除自己创建的标记
      </p>
    </section>

    <section v-else class="editor-placeholder">
      <span class="placeholder-icon">↖</span>
      <p>选择左侧图钉，或点击图片新增标记。</p>
    </section>
  </aside>
</template>

<style scoped>
.annotation-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--border);
}

.panel-kicker {
  color: var(--muted);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.17em;
}

.panel-heading h2 {
  margin: 5px 0 0;
  font-size: 21px;
  letter-spacing: -0.03em;
}

.count-pill {
  display: flex;
  align-items: baseline;
  min-width: 48px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text);
  font-size: 13px;
  font-weight: 750;
  justify-content: center;
}

.count-pill i {
  color: var(--muted);
  font-size: 9px;
  font-style: normal;
  font-weight: 600;
}

.annotation-list {
  min-height: 84px;
  padding: 10px;
  overflow-y: auto;
  flex: 1 1 auto;
}

.annotation-item {
  display: flex;
  width: 100%;
  gap: 11px;
  padding: 12px 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    background 140ms ease,
    border-color 140ms ease;
}

.annotation-item + .annotation-item {
  margin-top: 4px;
}

.annotation-item:hover {
  background: var(--surface-muted);
}

.annotation-item.is-selected {
  border-color: color-mix(in srgb, var(--accent) 22%, var(--border));
  background: var(--accent-soft);
}

.annotation-item.is-empty-note .annotation-note-preview {
  color: var(--danger);
  font-style: italic;
}

.list-number {
  display: grid;
  width: 27px;
  height: 27px;
  flex: none;
  place-items: center;
  border: 2px solid rgb(255 255 255 / 80%);
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
  color: white;
  font-size: 10px;
  font-weight: 800;
}

.annotation-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5px;
}

.annotation-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 9px;
  line-height: 1.2;
}

.annotation-meta strong {
  color: var(--text);
  font-size: 11px;
  font-weight: 700;
}

.annotation-note-preview {
  overflow: hidden;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: #fef3c7;
  color: #a16207;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.conflict-badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 8px;
  font-weight: 800;
}

.annotation-item.has-conflict {
  border-color: color-mix(in srgb, var(--danger) 30%, var(--border));
}

.empty-list {
  display: flex;
  height: 100%;
  min-height: 150px;
  padding: 24px 20px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--muted);
  text-align: center;
}

.empty-list-mark {
  display: grid;
  width: 38px;
  height: 38px;
  margin-bottom: 12px;
  place-items: center;
  border: 1px dashed var(--border-strong);
  border-radius: 50%;
  color: var(--accent);
  font-size: 22px;
}

.empty-list strong {
  color: var(--text-soft);
  font-size: 13px;
}

.empty-list p {
  max-width: 220px;
  margin: 7px 0 0;
  font-size: 11px;
  line-height: 1.6;
}

.annotation-editor {
  flex: none;
  padding: 17px 20px 20px;
  border-top: 1px solid var(--border);
  background: #fcfcf9;
}

.editor-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

.editor-heading > div {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-eyebrow {
  font-size: 13px;
  font-weight: 750;
}

.editor-author {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 10px;
}

.editor-author i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
  color: var(--muted);
  font-size: 9px;
  font-variant-numeric: tabular-nums;
}

.remote-conflict {
  margin-bottom: 14px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 24%, var(--border));
  border-radius: 10px;
  background: var(--danger-soft);
}

.remote-conflict-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.remote-conflict-heading strong {
  color: #991b1b;
  font-size: 11px;
}

.remote-conflict-heading span {
  color: #b45353;
  font-size: 8px;
}

.remote-note {
  margin: 9px 0 0;
  padding: 8px 9px;
  border-radius: 7px;
  background: rgb(255 255 255 / 72%);
  color: #7f1d1d;
  font-size: 10px;
  line-height: 1.55;
}

.remote-conflict-actions {
  display: flex;
  margin-top: 10px;
  justify-content: flex-end;
  gap: 7px;
}

.coordinate-label {
  letter-spacing: 0.04em;
}

.note-warning {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 10px;
}

.delete-button {
  margin-top: 14px;
  padding: 8px 11px;
  border: 1px solid color-mix(in srgb, var(--danger) 25%, var(--border));
  border-radius: 8px;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 650;
}

.delete-button:hover {
  background: var(--danger-soft);
}

.delete-restriction {
  margin: 14px 0 0;
  color: var(--muted);
  font-size: 9px;
}

.editor-placeholder {
  display: flex;
  min-height: 150px;
  padding: 24px;
  border-top: 1px solid var(--border);
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
}

.placeholder-icon {
  margin-bottom: 8px;
  color: var(--border-strong);
  font-size: 24px;
}

.editor-placeholder p {
  max-width: 190px;
  margin: 0;
}
</style>
