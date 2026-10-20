<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { ApiRequestError, createSession } from '@/services/api'
import { useOperatorSession } from '@/stores/operatorSession'
import { pushToast } from '@/composables/useToast'
import type { Operator } from '@/types/api'

const props = defineProps<{
  open: boolean
  required?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const {
  currentOperator,
  knownOperators,
  selectOperator,
  setOperator,
  refreshKnownOperators,
} = useOperatorSession()
const name = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const submitting = ref(false)
const errorMessage = ref('')
const heading = computed(() => {
  if (!props.required) return '切换操作人'
  return knownOperators.value.length ? '选择操作人' : '先留下你的名字'
})

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    refreshKnownOperators()
    errorMessage.value = ''
    name.value = ''
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
  },
)

function close(): void {
  if (props.required || submitting.value) return
  emit('close')
}

function chooseOperator(operator: Operator): void {
  selectOperator(operator)
  pushToast(`已切换为 ${operator.displayName}`, 'success')
  emit('saved')
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
        <h2 id="session-title">{{ heading }}</h2>
        <p class="dialog-copy">
          姓名只用于标记署名和区分操作者，不需要密码。所有人默认可查看和编辑标记。
        </p>

        <div v-if="knownOperators.length" class="known-operators">
          <div class="known-heading">
            <span>本浏览器保存的操作人</span>
            <span>{{ knownOperators.length }} 人</span>
          </div>
          <div class="operator-option-list">
            <button
              v-for="operator in knownOperators"
              :key="operator.id"
              type="button"
              class="operator-option"
              :class="{
                'is-current': operator.id === currentOperator?.id,
              }"
              :disabled="submitting"
              @click="chooseOperator(operator)"
            >
              <span
                class="identity-avatar"
                :style="{ backgroundColor: operator.color }"
              >
                {{ operator.displayName.slice(0, 1) }}
              </span>
              <span class="identity-copy">
                <strong>{{ operator.displayName }}</strong>
                <small>
                  {{
                    operator.id === currentOperator?.id
                      ? '当前标签页正在使用'
                      : '使用这个操作人'
                  }}
                </small>
              </span>
              <span
                v-if="operator.id === currentOperator?.id"
                class="current-badge"
              >
                当前
              </span>
              <span v-else class="option-arrow">→</span>
            </button>
          </div>
          <div class="identity-divider">
            <span>或添加新操作人</span>
          </div>
        </div>

        <form class="session-form" @submit.prevent="submit">
          <label class="field-label" for="operator-name">
            {{ knownOperators.length ? '新操作人姓名' : '你的姓名' }}
          </label>
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

.known-operators {
  margin-top: 24px;
}

.known-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 650;
}

.operator-option-list {
  display: flex;
  max-height: 220px;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.operator-option {
  display: flex;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.operator-option:hover {
  border-color: var(--border-strong);
  background: var(--surface-muted);
}

.operator-option.is-current {
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  background: var(--accent-soft);
}

.identity-avatar {
  display: grid;
  width: 34px;
  height: 34px;
  flex: none;
  place-items: center;
  border: 2px solid white;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--border);
  color: white;
  font-size: 12px;
  font-weight: 800;
}

.identity-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.identity-copy strong {
  font-size: 12px;
}

.identity-copy small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 9px;
}

.current-badge {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--accent);
  color: white;
  font-size: 8px;
  font-weight: 700;
}

.option-arrow {
  color: var(--muted);
}

.identity-divider {
  display: flex;
  margin: 18px 0 0;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-size: 9px;
}

.identity-divider::before,
.identity-divider::after {
  height: 1px;
  background: var(--border);
  content: '';
  flex: 1;
}

.known-operators + .session-form {
  margin-top: 16px;
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
