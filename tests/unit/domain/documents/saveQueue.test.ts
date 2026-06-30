import { describe, expect, it } from 'vitest'
import { createTextFileFormat } from '../../../../src/domain/document'
import { createDocumentSaveQueue, type SaveJob } from '../../../../src/domain/documents/saveQueue'

function createJob(revision: number): SaveJob {
  return {
    documentId: 'doc-1',
    documentNativeId: 'native-1',
    pathBeforeSave: 'C:\\Docs\\draft.md',
    workspaceIdBeforeSave: null,
    relativePathBeforeSave: null,
    revision,
    contentSnapshot: `revision-${revision}`,
    expectedFingerprint: null,
    fileFormat: createTextFileFormat(),
    reason: 'manual',
  }
}

describe('document save queue', () => {
  it('serializes saves per document and keeps the newest pending revision', async () => {
    const revisions: number[] = []
    let releaseActiveSave: (() => void) | null = null
    const firstSaveBlocked = new Promise<void>((resolve) => {
      releaseActiveSave = resolve
    })

    const queue = createDocumentSaveQueue({
      async performSave(job) {
        revisions.push(job.revision)

        if (job.revision === 1) {
          await firstSaveBlocked
        }

        return {
          ...jobResult(job.revision),
        }
      },
    })

    const first = queue.enqueue(createJob(1))
    const second = queue.enqueue(createJob(2))
    const third = queue.enqueue(createJob(3))

    releaseActiveSave!()
    await Promise.all([first, second, third])

    expect(revisions).toEqual([1, 3])
  })

  it('surfaces native save failures back to the caller', async () => {
    const queue = createDocumentSaveQueue({
      async performSave() {
        throw {
          code: 'file_changed_externally',
          operation: 'save_text_file',
          userMessage: 'File changed on disk.',
          technicalMessage: null,
          retryable: true,
        }
      },
    })

    await expect(queue.enqueue(createJob(5))).rejects.toMatchObject({
      code: 'file_changed_externally',
    })
  })
})

function jobResult(revision: number) {
  return {
    id: `native-${revision}`,
    path: `C:\\Docs\\draft-${revision}.md`,
    content: `revision-${revision}`,
    workspaceId: null,
    relativePath: null,
    fileFormat: createTextFileFormat(),
    fingerprint: {
      size: revision,
      modifiedAtMs: revision * 10,
    },
  }
}
