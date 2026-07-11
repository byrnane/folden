import { describe, expect, it } from 'vitest'
import {
  countOpenDocumentViews,
  shouldPromptToDiscardDocument,
} from '../../../../src/domain/documents/closeProtection'

describe('close protection', () => {
  it('counts document views across panes', () => {
    expect(
      countOpenDocumentViews(
        [{ documentIds: ['doc-a', 'doc-b'] }, { documentIds: ['doc-b'] }],
        'doc-b',
      ),
    ).toBe(2)
  })

  it('does not prompt when a dirty document remains open in another pane', () => {
    expect(
      shouldPromptToDiscardDocument(
        [{ documentIds: ['doc-a'] }, { documentIds: ['doc-a'] }],
        'doc-a',
        true,
      ),
    ).toBe(false)
  })

  it('prompts when closing the final dirty view', () => {
    expect(
      shouldPromptToDiscardDocument(
        [{ documentIds: ['doc-a'] }, { documentIds: [] }],
        'doc-a',
        true,
      ),
    ).toBe(true)
  })
})
