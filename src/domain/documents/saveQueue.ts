import type { FileFingerprint, TextFileFormat } from '../document'
import type { SaveDocumentResult } from '../native'
import type { NativeError } from '../nativeError'

export type SaveJob = {
  documentId: string
  documentNativeId: string | null
  pathBeforeSave: string | null
  workspaceIdBeforeSave: string | null
  relativePathBeforeSave: string | null
  revision: number
  contentSnapshot: string
  expectedFingerprint: FileFingerprint | null
  fileFormat: TextFileFormat
  suggestedFileName?: string
  reason: 'manual' | 'autosave'
}

type SaveQueueEvents = {
  onQueued?: (job: SaveJob) => void
  onSaving?: (job: SaveJob) => void
  onSaved?: (job: SaveJob, result: SaveDocumentResult) => void
  onError?: (job: SaveJob, error: NativeError) => void
}

type SaveQueueOptions = SaveQueueEvents & {
  performSave: (job: SaveJob) => Promise<SaveDocumentResult | null>
}

type SaveQueueState = {
  active: Promise<void> | null
  pendingJob: SaveJob | null
}

export function createDocumentSaveQueue(options: SaveQueueOptions) {
  const states = new Map<string, SaveQueueState>()

  function getState(documentId: string) {
    const existingState = states.get(documentId)

    if (existingState) {
      return existingState
    }

    const state: SaveQueueState = {
      active: null,
      pendingJob: null,
    }
    states.set(documentId, state)
    return state
  }

  async function runLoop(documentId: string) {
    const state = getState(documentId)

    while (state.pendingJob) {
      const job = state.pendingJob
      state.pendingJob = null
      options.onSaving?.(job)

      try {
        const result = await options.performSave(job)

        if (result) {
          options.onSaved?.(job, result)
        }
      } catch (error) {
        options.onError?.(job, error as NativeError)
        throw error
      }
    }

    state.active = null
  }

  async function enqueue(job: SaveJob) {
    const state = getState(job.documentId)
    state.pendingJob = job
    options.onQueued?.(job)

    if (!state.active) {
      state.active = runLoop(job.documentId)
    }

    await state.active
  }

  return {
    enqueue,
  }
}
