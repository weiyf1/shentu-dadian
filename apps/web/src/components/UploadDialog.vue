<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { formatFileSize } from '@/lib/format'
import { ApiRequestError, uploadImage } from '@/services/api'
import type { ImageSummary } from '@/types/api'
import { pushToast } from '@/composables/useToast'
import { useOperatorSession } from '@/stores/operatorSession'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  uploaded: [image: ImageSummary]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const title = ref('')
const previewUrl = ref('')
const uploading = ref(false)
const errorMessage = ref('')
const dragging = ref(false)
const { clearOperator, requestSession } = useOperatorSession()

const canSubmit = computed(
  () => Boolean(selectedFile.value) && !uploading.value,
)

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

watch(
  () => props.open,
  (open) => {
    if (open) {
      reset()
    } else {
      revokePreview()
    }
  },
)

function reset(): void {
  revokePreview()
  selectedFile.value = null
  title.value = ''
  errorMessage.value = ''
  uploading.value = false
  dragging.value = false
  if (fileInput.value) fileInput.value.value = ''
}

function revokePreview(): void {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

function fileNameWithoutExtension(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function acceptFile(file: File | undefined): void {
  errorMessage.value = ''
  if (!file) return

  if (!ACCEPTED_TYPES.has(file.type)) {
    errorMessage.value = '只支持 JPG、PNG 或 WebP 图片'
    return
  }
  if (file.size > MAX_BYTES) {
    errorMessage.value = '图片不能超过 10 MB'
    return
  }

  revokePreview()
  selectedFile.value = file
  title.value = fileNameWithoutExtension(file.name).slice(0, 80)
  previewUrl.value = URL.createObjectURL(file)
}

function handleInput(event: Event): void {
  const input = event.target as HTMLInputElement
  acceptFile(input.files?.[0])
}

function handleDrop(event: DragEvent): void {
  dragging.value = false
  acceptFile(event.dataTransfer?.files[0])
}

function close(): void {
  if (uploading.value) return
  emit('close')
}

async function submit(): Promise<void> {
  if (!selectedFile.value) return

  uploading.value = true
  errorMessage.value = ''
  try {
    const image = await uploadImage(selectedFile.value, title.value)
    pushToast('图片上传成功', 'success')
    emit('uploaded', image)
    emit('close')
  } catch (error) {
    if (
      error instanceof ApiRequestError &&
      error.code === 'OPERATOR_REQUIRED'
    ) {
      clearOperator()
      requestSession()
      emit('close')
      return
    }

    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : '上传失败，请稍后重试'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <Transition name="modal">
    <div
      v-if="open"
      class="modal-backdrop"
      role="presentation"
      @mousedown.self="close"
    >
      <section
        class="dialog upload-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-title"
      >
        <div class="upload-heading">
          <div>
            <div class="dialog-kicker">ADD REFERENCE</div>
            <h2 id="upload-title">上传一张审图素材</h2>
          </div>
          <button
            class="icon-button"
            type="button"
            aria-label="关闭"
            :disabled="uploading"
            @click="close"
          >
            ×
          </button>
        </div>

        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          @change="handleInput"
        />

        <button
          type="button"
          class="drop-zone"
          :class="{ 'is-dragging': dragging, 'has-file': selectedFile }"
          @click="fileInput?.click()"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="handleDrop"
        >
          <template v-if="selectedFile">
            <img :src="previewUrl" alt="待上传图片预览" class="upload-preview" />
            <span class="file-meta">
              <strong>{{ selectedFile.name }}</strong>
              <small>{{ formatFileSize(selectedFile.size) }} · 点击更换</small>
            </span>
          </template>
          <template v-else>
            <span class="upload-symbol" aria-hidden="true">↑</span>
            <strong>点击选择或拖入图片</strong>
            <small>JPG / PNG / WebP，单张不超过 10 MB</small>
          </template>
        </button>

        <label class="field-label upload-title-field" for="image-title">
          图片标题
        </label>
        <input
          id="image-title"
          v-model="title"
          class="text-input"
          maxlength="80"
          placeholder="例如：秋季新品主图"
        />

        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

        <div class="dialog-actions">
          <button
            class="button button-ghost"
            type="button"
            :disabled="uploading"
            @click="close"
          >
            取消
          </button>
          <button
            class="button button-primary"
            type="button"
            :disabled="!canSubmit"
            @click="submit"
          >
            {{ uploading ? '上传中…' : '上传并打开' }}
          </button>
        </div>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.upload-dialog {
  width: min(560px, calc(100vw - 32px));
}

.upload-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.upload-heading h2 {
  margin: 10px 0 0;
  font-size: 28px;
  letter-spacing: -0.03em;
}

.drop-zone {
  display: flex;
  width: 100%;
  min-height: 220px;
  margin-top: 24px;
  padding: 22px;
  border: 1px dashed var(--border-strong);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 80%), rgb(246 247 243 / 88%)),
    repeating-linear-gradient(
      45deg,
      transparent 0 12px,
      rgb(30 41 59 / 2%) 12px 13px
    );
  color: var(--text);
  cursor: pointer;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    transform 160ms ease;
}

.drop-zone:hover,
.drop-zone.is-dragging {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.drop-zone.has-file {
  align-items: stretch;
  justify-content: flex-start;
  padding: 12px;
}

.upload-symbol {
  display: grid;
  width: 44px;
  height: 44px;
  margin-bottom: 14px;
  place-items: center;
  border-radius: 14px;
  background: var(--ink);
  color: white;
  font-size: 24px;
  font-weight: 300;
}

.drop-zone small {
  margin-top: 7px;
  color: var(--muted);
  font-size: 11px;
}

.upload-preview {
  width: 100%;
  max-height: 280px;
  border-radius: 10px;
  object-fit: contain;
  background: #eceee9;
}

.file-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 6px 2px;
  font-size: 12px;
  text-align: left;
}

.file-meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta small {
  flex: none;
}

.upload-title-field {
  margin-top: 20px;
}

.form-error {
  margin: 10px 0 0;
  color: var(--danger);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}
</style>
