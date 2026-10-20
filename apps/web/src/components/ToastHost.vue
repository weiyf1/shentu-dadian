<script setup lang="ts">
import { dismissToast, useToast } from '@/composables/useToast'

const { toasts } = useToast()
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <button
        v-for="toast in toasts"
        :key="toast.id"
        type="button"
        class="toast"
        :class="`toast-${toast.tone}`"
        @click="dismissToast(toast.id)"
      >
        <span class="toast-dot" aria-hidden="true"></span>
        <span>{{ toast.message }}</span>
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  z-index: 80;
  top: calc(var(--header-height) + 16px);
  right: 20px;
  display: flex;
  width: min(360px, calc(100vw - 32px));
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 13px 15px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  color: var(--text);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  pointer-events: auto;
  text-align: left;
}

.toast-dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.toast-success .toast-dot {
  background: var(--success);
}

.toast-error .toast-dot {
  background: var(--danger);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
