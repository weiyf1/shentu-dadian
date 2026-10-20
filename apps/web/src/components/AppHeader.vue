<script setup lang="ts">
import { RouterLink } from 'vue-router'

import { useOperatorSession } from '@/stores/operatorSession'

defineEmits<{
  switchSession: []
}>()

const { currentOperator } = useOperatorSession()
</script>

<template>
  <header class="app-header">
    <RouterLink to="/" class="brand" aria-label="返回图片库">
      <span class="brand-mark" aria-hidden="true">
        <span></span>
      </span>
      <span class="brand-copy">
        <strong>审图打点</strong>
        <small>Review Marks</small>
      </span>
    </RouterLink>

    <div class="header-note">
      <span class="status-dot"></span>
      本地协作工具
    </div>

    <div class="account-area">
      <template v-if="currentOperator">
        <span
          class="operator-avatar"
          :style="{ backgroundColor: currentOperator.color }"
          aria-hidden="true"
        >
          {{ currentOperator.displayName.slice(0, 1) }}
        </span>
        <span class="operator-name">{{ currentOperator.displayName }}</span>
        <button class="text-button" type="button" @click="$emit('switchSession')">
          切换
        </button>
      </template>
      <button
        v-else
        class="button button-small"
        type="button"
        @click="$emit('switchSession')"
      >
        输入姓名
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: 24px;
  height: var(--header-height);
  padding: 0 28px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 75%, transparent);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  backdrop-filter: blur(18px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  color: var(--text);
  text-decoration: none;
}

.brand-mark {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 11px;
  background: var(--ink);
  box-shadow: 0 8px 18px rgb(30 41 59 / 18%);
}

.brand-mark::before,
.brand-mark::after,
.brand-mark span {
  position: absolute;
  content: '';
  background: #f6c85f;
}

.brand-mark::before {
  width: 13px;
  height: 3px;
  border-radius: 2px;
  transform: translateY(-4px);
}

.brand-mark::after {
  width: 3px;
  height: 13px;
  border-radius: 2px;
}

.brand-mark span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--surface);
}

.brand-copy {
  display: flex;
  flex-direction: column;
  line-height: 1.05;
}

.brand-copy strong {
  font-size: 16px;
  letter-spacing: 0.04em;
}

.brand-copy small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.header-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 0 4px rgb(22 163 74 / 10%);
}

.account-area {
  display: flex;
  align-items: center;
  gap: 9px;
}

.operator-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 2px solid var(--surface);
  border-radius: 50%;
  color: white;
  font-size: 12px;
  font-weight: 750;
  box-shadow: 0 0 0 1px var(--border);
}

.operator-name {
  max-width: 120px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-button {
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 6px 2px;
}

.text-button:hover {
  color: var(--text);
}

@media (max-width: 720px) {
  .app-header {
    padding: 0 16px;
  }

  .header-note,
  .operator-name {
    display: none;
  }
}
</style>
