export type ConflictDiffRowKind = 'unchanged' | 'added' | 'removed' | 'changed'

export type ConflictDiffRow = {
  kind: ConflictDiffRowKind
  leftLineNumber: number | null
  leftText: string
  rightLineNumber: number | null
  rightText: string
}

type LineRange = {
  leftStart: number
  leftEnd: number
  rightStart: number
  rightEnd: number
}

export function buildConflictDiffRows(
  leftContent: string,
  rightContent: string,
): ConflictDiffRow[] {
  const leftLines = splitLines(leftContent)
  const rightLines = splitLines(rightContent)
  const equalRanges = findEqualRanges(leftLines, rightLines)
  const rows: ConflictDiffRow[] = []
  let previousLeftEnd = 0
  let previousRightEnd = 0

  for (const range of equalRanges) {
    rows.push(
      ...buildChangedRows(
        leftLines,
        rightLines,
        previousLeftEnd,
        range.leftStart,
        previousRightEnd,
        range.rightStart,
      ),
    )

    for (let index = 0; index < range.leftEnd - range.leftStart; index += 1) {
      rows.push({
        kind: 'unchanged',
        leftLineNumber: range.leftStart + index + 1,
        leftText: leftLines[range.leftStart + index] ?? '',
        rightLineNumber: range.rightStart + index + 1,
        rightText: rightLines[range.rightStart + index] ?? '',
      })
    }

    previousLeftEnd = range.leftEnd
    previousRightEnd = range.rightEnd
  }

  rows.push(
    ...buildChangedRows(
      leftLines,
      rightLines,
      previousLeftEnd,
      leftLines.length,
      previousRightEnd,
      rightLines.length,
    ),
  )

  return rows
}

function buildChangedRows(
  leftLines: string[],
  rightLines: string[],
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  const leftChunk = leftLines.slice(leftStart, leftEnd)
  const rightChunk = rightLines.slice(rightStart, rightEnd)
  const rowCount = Math.max(leftChunk.length, rightChunk.length)
  const rows: ConflictDiffRow[] = []

  for (let index = 0; index < rowCount; index += 1) {
    const leftExists = index < leftChunk.length
    const rightExists = index < rightChunk.length

    rows.push({
      kind: leftExists && rightExists ? 'changed' : leftExists ? 'removed' : 'added',
      leftLineNumber: leftExists ? leftStart + index + 1 : null,
      leftText: leftExists ? (leftChunk[index] ?? '') : '',
      rightLineNumber: rightExists ? rightStart + index + 1 : null,
      rightText: rightExists ? (rightChunk[index] ?? '') : '',
    })
  }

  return rows
}

function splitLines(content: string) {
  return content.split(/\r?\n/u)
}

function findEqualRanges(leftLines: string[], rightLines: string[]) {
  const leftLength = leftLines.length
  const rightLength = rightLines.length
  const lcs = Array.from({ length: leftLength + 1 }, () => Array<number>(rightLength + 1).fill(0))

  for (let leftIndex = leftLength - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = rightLength - 1; rightIndex >= 0; rightIndex -= 1) {
      lcs[leftIndex][rightIndex] =
        leftLines[leftIndex] === rightLines[rightIndex]
          ? lcs[leftIndex + 1][rightIndex + 1] + 1
          : Math.max(lcs[leftIndex + 1][rightIndex], lcs[leftIndex][rightIndex + 1])
    }
  }

  const ranges: LineRange[] = []
  let leftIndex = 0
  let rightIndex = 0

  while (leftIndex < leftLength && rightIndex < rightLength) {
    if (leftLines[leftIndex] === rightLines[rightIndex]) {
      const leftStart = leftIndex
      const rightStart = rightIndex

      while (
        leftIndex < leftLength &&
        rightIndex < rightLength &&
        leftLines[leftIndex] === rightLines[rightIndex]
      ) {
        leftIndex += 1
        rightIndex += 1
      }

      ranges.push({
        leftStart,
        leftEnd: leftIndex,
        rightStart,
        rightEnd: rightIndex,
      })
      continue
    }

    if (lcs[leftIndex + 1][rightIndex] >= lcs[leftIndex][rightIndex + 1]) {
      leftIndex += 1
    } else {
      rightIndex += 1
    }
  }

  return ranges
}
