import { ref } from 'vue'
import type { RecoverySnapshot } from '../sessionRecovery'

export function createSessionController(hasNativeRuntime: boolean) {
  const pendingRecoveryEntries = ref<RecoverySnapshot[]>([])
  let restoreComplete = false
  let persistTimeout: number | null = null
  let persistRunning = false
  let persistRequested = false

  function isRestoreComplete() {
    return restoreComplete
  }

  function markRestoreComplete() {
    restoreComplete = true
  }

  async function persistSessionAndRecoveryState(persist: () => Promise<void>) {
    if (!hasNativeRuntime || !restoreComplete) {
      return
    }

    if (persistRunning) {
      persistRequested = true
      return
    }

    persistRunning = true

    try {
      await persist()
    } finally {
      persistRunning = false

      if (persistRequested) {
        persistRequested = false
        void persistSessionAndRecoveryState(persist)
      }
    }
  }

  function scheduleSessionPersistence(persist: () => Promise<void>) {
    if (!hasNativeRuntime || !restoreComplete) {
      return
    }

    if (persistTimeout !== null) {
      window.clearTimeout(persistTimeout)
    }

    persistTimeout = window.setTimeout(() => {
      persistTimeout = null
      void persistSessionAndRecoveryState(persist)
    }, 250)
  }

  function dispose() {
    if (persistTimeout !== null) {
      window.clearTimeout(persistTimeout)
      persistTimeout = null
    }
  }

  return {
    pendingRecoveryEntries,
    isRestoreComplete,
    markRestoreComplete,
    persistSessionAndRecoveryState,
    scheduleSessionPersistence,
    dispose,
  }
}
