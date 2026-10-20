import { computed, ref } from 'vue'

import {
  clearStoredOperator,
  readStoredOperator,
  writeStoredOperator,
} from '@/lib/operatorStorage'
import type { Operator } from '@/types/api'

const currentOperator = ref<Operator | null>(readStoredOperator())
const sessionPromptVersion = ref(0)

export function useOperatorSession() {
  const isSignedIn = computed(() => currentOperator.value !== null)

  function setOperator(operator: Operator): void {
    currentOperator.value = operator
    writeStoredOperator(operator)
  }

  function clearOperator(): void {
    currentOperator.value = null
    clearStoredOperator()
  }

  function requestSession(): void {
    sessionPromptVersion.value += 1
  }

  return {
    currentOperator,
    isSignedIn,
    sessionPromptVersion,
    setOperator,
    clearOperator,
    requestSession,
  }
}
