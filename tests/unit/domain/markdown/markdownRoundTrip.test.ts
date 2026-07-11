import { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { Table } from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { Lexer, type Token, type Tokens } from 'marked'
import { describe, expect, it } from 'vitest'

const supportedFixtures = [
  {
    name: 'atx heading and paragraph',
    source: '# Heading\n\nParagraph text.',
  },
  {
    name: 'setext heading stays a heading',
    source: 'Heading\n===',
  },
  {
    name: 'inline formatting',
    source: 'Text with **bold**, _italic_, ~~strike~~, and `code`.',
  },
  {
    name: 'nested bullet list',
    source: '- one\n  - nested\n- three',
  },
  {
    name: 'ordered list start number',
    source: '3. third\n4. fourth',
  },
  {
    name: 'nested blockquote',
    source: '> Quote line\n>\n> > Nested quote',
  },
  {
    name: 'fenced code block',
    source: '```ts\nconst answer = 42\n```',
  },
  {
    name: 'indented code block stays code',
    source: '    const answer = 42\n    console.log(answer)',
  },
  {
    name: 'inline link with title',
    source: '[link](https://example.com "Example")',
  },
  {
    name: 'reference link stays a link',
    source: '[link][example]\n\n[example]: https://example.com "Example"',
  },
  {
    name: 'inline image with title',
    source: '![image](./image.png "Preview")',
  },
  {
    name: 'reference image stays an image',
    source: '![image][preview]\n\n[preview]: ./image.png "Preview"',
  },
  {
    name: 'horizontal rule',
    source: '***',
  },
  {
    name: 'table',
    source: '| A | B |\n| - | - |\n| 1 | 2 |',
  },
  {
    name: 'task list',
    source: '- [x] Done\n- [ ] Todo',
  },
  {
    name: 'hard break',
    source: 'Line one  \nLine two',
  },
  {
    name: 'autolink stays a link',
    source: '<https://example.com>',
  },
  {
    name: 'unicode content',
    source: 'Unicode: \u041f\u0440\u0438\u0432\u0435\u0442, \u043c\u0438\u0440',
  },
  {
    name: 'mixed document',
    source: [
      '# Review: Republic Commando',
      '',
      '## Intro',
      '',
      'Did you know **Star Wars** had a cult tactical shooter?',
      '',
      '> It still feels distinct today.',
      '',
      '- squad control',
      '- atmosphere',
      '',
      '![cover](./cover.png)',
    ].join('\n'),
  },
  {
    name: 'crlf input',
    source: 'Line one\r\n\r\nLine two',
  },
] as const

type InlineSemanticNode =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'del'; content: InlineSemanticNode[] }
  | { type: 'codespan'; text: string }
  | { type: 'link'; href: string; title: string | null; content: InlineSemanticNode[] }
  | { type: 'image'; href: string; title: string | null; alt: string }
  | { type: 'br' }

type BlockSemanticNode =
  | { type: 'paragraph'; content: InlineSemanticNode[] }
  | { type: 'heading'; depth: number; content: InlineSemanticNode[] }
  | { type: 'blockquote'; content: BlockSemanticNode[] }
  | {
      type: 'list'
      ordered: boolean
      start: number | null
      items: { checked: boolean | null; content: BlockSemanticNode[] }[]
    }
  | { type: 'table'; header: InlineSemanticNode[][]; rows: InlineSemanticNode[][][] }
  | { type: 'code'; lang: string | null; text: string }
  | { type: 'hr' }

type TableCellToken = {
  tokens?: Token[]
}

function createMarkdownEditor(content = '') {
  return new Editor({
    content,
    contentType: 'markdown',
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Markdown,
    ],
  })
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, '\n')
}

function roundTripMarkdown(source: string) {
  const editor = createMarkdownEditor(source)
  const output = editor.getMarkdown()
  editor.destroy()
  return normalizeLineEndings(output).trim()
}

function normalizeMarkdownSemantics(source: string) {
  return normalizeBlockTokens(Lexer.lex(normalizeLineEndings(source)))
}

function normalizeBlockTokens(tokens: Token[]): BlockSemanticNode[] {
  const nodes: BlockSemanticNode[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'def':
        break
      case 'paragraph':
        nodes.push({
          type: 'paragraph',
          content: normalizeInlineTokens(token.tokens ?? []),
        })
        break
      case 'heading':
        nodes.push({
          type: 'heading',
          depth: token.depth,
          content: normalizeInlineTokens(token.tokens ?? []),
        })
        break
      case 'blockquote':
        nodes.push({
          type: 'blockquote',
          content: normalizeBlockTokens(token.tokens ?? []),
        })
        break
      case 'text':
        nodes.push({
          type: 'paragraph',
          content: normalizeInlineTokens(token.tokens ?? [token]),
        })
        break
      case 'list':
      case 'taskList':
        nodes.push({
          type: 'list',
          ordered: token.type === 'list' ? token.ordered : false,
          start:
            token.type === 'list' && token.ordered ? (token.start === '' ? 1 : token.start) : null,
          items: token.items.map((item: Tokens.ListItem) => ({
            checked: typeof item.checked === 'boolean' ? item.checked : null,
            content: normalizeBlockTokens(item.tokens ?? []),
          })),
        })
        break
      case 'table':
        nodes.push({
          type: 'table',
          header: (token.header as TableCellToken[]).map((cell) =>
            normalizeInlineTokens(cell.tokens ?? []),
          ),
          rows: (token.rows as TableCellToken[][]).map((row) =>
            row.map((cell) => normalizeInlineTokens(cell.tokens ?? [])),
          ),
        })
        break
      case 'code':
        nodes.push({
          type: 'code',
          lang: token.lang ? token.lang : null,
          text: normalizeLineEndings(token.text),
        })
        break
      case 'hr':
        nodes.push({
          type: 'hr',
        })
        break
      default:
        throw new Error(`Unsupported block token in semantic comparison: ${token.type}`)
    }
  }

  return nodes
}

function normalizeInlineTokens(tokens: Token[]): InlineSemanticNode[] {
  const nodes: InlineSemanticNode[] = []

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape':
        nodes.push({
          type: 'text',
          text: normalizeLineEndings(token.text),
        })
        break
      case 'strong':
      case 'em':
      case 'del':
        nodes.push({
          type: token.type,
          content: normalizeInlineTokens(token.tokens ?? []),
        })
        break
      case 'codespan':
        nodes.push({
          type: 'codespan',
          text: token.text,
        })
        break
      case 'link':
        nodes.push({
          type: 'link',
          href: token.href,
          title: token.title ?? null,
          content: normalizeInlineTokens(token.tokens ?? []),
        })
        break
      case 'image':
        nodes.push({
          type: 'image',
          href: token.href,
          title: token.title ?? null,
          alt: token.text,
        })
        break
      case 'br':
        nodes.push({
          type: 'br',
        })
        break
      default:
        throw new Error(`Unsupported inline token in semantic comparison: ${token.type}`)
    }
  }

  return mergeAdjacentTextNodes(nodes)
}

function mergeAdjacentTextNodes(nodes: InlineSemanticNode[]) {
  return nodes.reduce<InlineSemanticNode[]>((result, node) => {
    if (node.type !== 'text') {
      result.push(node)
      return result
    }

    const previousNode = result.at(-1)

    if (previousNode?.type === 'text') {
      previousNode.text += node.text
      return result
    }

    result.push({ ...node })
    return result
  }, [])
}

describe('markdown round trip', () => {
  it('preserves supported fixtures semantically', () => {
    for (const fixture of supportedFixtures) {
      expect(normalizeMarkdownSemantics(roundTripMarkdown(fixture.source)), fixture.name).toEqual(
        normalizeMarkdownSemantics(fixture.source),
      )
    }
  })

  it('keeps canonical markdown stable after the first round trip', () => {
    for (const fixture of supportedFixtures) {
      const firstOutput = roundTripMarkdown(fixture.source)
      expect(roundTripMarkdown(firstOutput), fixture.name).toBe(firstOutput)
    }
  })

  it('can apply initial Markdown content without emitting editor updates', () => {
    let updateCount = 0
    const editor = createMarkdownEditor('# Placeholder')

    editor.on('update', () => {
      updateCount += 1
    })

    editor.commands.setContent('# Visible\n\nText', {
      contentType: 'markdown',
      emitUpdate: false,
    })

    expect(editor.getMarkdown()).toBe('# Visible\n\nText')
    expect(updateCount).toBe(0)

    editor.destroy()
  })
})
