<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { ApiRequestError, createSession } from '@/services/api'
import { useOperatorSession } from '@/stores/operatorSession'
import { pushToast } from '@/composables/useToast'

const props = defineProps<{
  open: boolean
  required?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { currentOperator, setOperator } = useOperatorSession()
const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const submitting = ref(false)
const errorMessage = ref('')

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    errorMessage.value = ''
    name.value = props.required ? '' : (currentOperator.value?.displayName ?? '')
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  },
)

function close(): void {
  if (props.required || submitting.value) return
  emit('close')
}

async function submit(): Promise<void> {
  const displayName = name.value.trim()
  if (!displayName) {
    errorMessage.value = '请输入姓名'
    return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    const result = await createSession(displayName)
    setOperator(result.operator)
    pushToast(
      result.created
        ? `欢迎，${result.operator.displayName}`
        : `已切换为 ${result.operator.displayName}`,
      'success',
    )
    emit('saved')
    emit('close')
  } catch (error) {
    errorMessage.value =
      error instanceof ApiRequestError
        ? error.message
        : '身份创建失败，请检查后端服务'
  } finally {
    submitting.value = false
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
        class="dialog session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-title"
      >
        <div class="dialog-kicker">COLLABORATION IDENTITY</div>
        <h2 id="session-title">
          {{ required ? '先留下你的名字' : '切换操作人' }}
        </h2>
        <p class="dialog-copy">
          姓名只用于标记署名和区分操作者，不需要密码。所有人默认可查看和编辑标记。
        </p>

        <form class="session-form" @submit.prevent="submit">
          <label class="field-label" for="operator-name">你的姓名</label>
          <input
            id="operator-name"
            ref="inputRef"
            v-model="name"
            class="text-input text-input-large"
            maxlength="30"
            autocomplete="name"
            placeholder="例如：王芳"
          />
          <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>

          <div class="dialog-actions">
            <button
              v-if="!required"
              class="button button-ghost"
              type="button"
              :disabled="submitting"
              @click="close"
            >
              取消
            </button>
            <button
              class="button button-primary"
              type="submit"
              :disabled="submitting || !name.trim()"
            >
              {{ submitting ? '正在确认…' : '进入工作台' }}
            </button>
          </div>
        </form>

        <p class="privacy-note">
          身份信息只保存在当前浏览器与本地 SQLite 中。
        </p>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.session-dialog {
  width: min(480px, calc(100vw - 32px));
}

.dialog-kicker {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.16em;
}

.session-dialog h2 {
  margin: 12px 0 0;
  font-size: clamp(25px, 4vw, 34px);
  letter-spacing: -0.035em;
}

.dialog-copy {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.75;
}

.session-form {
  margin-top: 26px;
}

.form-error {
  margin: 8px 0 0;
  color: var(--danger);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.privacy-note {
  margin: 22px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 11px;
}
</style>
