import { ref } from 'vue'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastMessage {
  id: number
  message: string
  tone: ToastTone
}

const toasts = ref<ToastMessage[]>([])
let nextId = 1

export function pushToast(message: string, tone: ToastTone = 'info'): void {
  const id = nextId
  nextId += 1
  toasts.value.push({ id, message, tone })

  window.setTimeout(() => {
    dismissToast(id)
  }, 4200)
}

export function dismissToast(id: number): void {
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

export function useToast() {
  return { toasts, pushToast, dismissToast }
}
