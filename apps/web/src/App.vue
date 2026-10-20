<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterView } from 'vue-router'

import AppHeader from '@/components/AppHeader.vue'
import SessionDialog from '@/components/SessionDialog.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useOperatorSession } from '@/stores/operatorSession'

const { currentOperator, sessionPromptVersion } = useOperatorSession()
const sessionOpen = ref(false)
const sessionRequired = ref(false)

function openSession(required: boolean): void {
  sessionRequired.value = required
  sessionOpen.value = true
}

function switchSession(): void {
  openSession(false)
}

watch(sessionPromptVersion, () => {
  openSession(true)
})

onMounted(() => {
  if (!currentOperator.value) {
    openSession(true)
  }
})
</script>

<template>
  <div class="app-shell">
    <AppHeader @switch-session="switchSession" />
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>

    <SessionDialog
      :open="sessionOpen"
      :required="sessionRequired"
      @close="sessionOpen = false"
      @saved="sessionOpen = false"
    />
    <ToastHost />
  </div>
</template>
