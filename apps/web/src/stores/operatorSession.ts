import { computed, ref } from 'vue'

import {
  OPERATOR_DIRECTORY_KEY,
  clearActiveOperator,
  readActiveOperator,
  readOperatorDirectory,
  removeOperatorFromDirectory,
  writeActiveOperator,
} from '@/lib/operatorStorage'
import type { Operator } from '@/types/api'

const currentOperator = ref<Operator | null>(readActiveOperator())
const knownOperators = ref<Operator[]>(readOperatorDirectory())
const sessionPromptVersion = ref(0)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === OPERATOR_DIRECTORY_KEY || event.key === null) {
      knownOperators.value = readOperatorDirectory()
    }
  })
}

export function useOperatorSession() {
  const isSignedIn = computed(() => currentOperator.value !== null)

  function setOperator(operator: Operator): void {
    currentOperator.value = operator
    writeActiveOperator(operator)
    knownOperators.value = readOperatorDirectory()
  }

  function selectOperator(operator: Operator): void {
    setOperator(operator)
  }

  function clearOperator(): void {
    const operatorId = currentOperator.value?.id
    currentOperator.value = null
    clearActiveOperator()

    if (operatorId) {
      knownOperators.value = removeOperatorFromDirectory(operatorId)
    }
  }

  function refreshKnownOperators(): void {
    knownOperators.value = readOperatorDirectory()
  }

  function requestSession(): void {
    sessionPromptVersion.value += 1
  }

  return {
    currentOperator,
    knownOperators,
    isSignedIn,
    sessionPromptVersion,
    setOperator,
    selectOperator,
    clearOperator,
    refreshKnownOperators,
    requestSession,
  }
}
