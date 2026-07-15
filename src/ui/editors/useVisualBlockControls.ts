import { Extension, type Editor } from '@tiptap/core'
import { type Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { nextTick, ref, type Ref, type ShallowRef } from 'vue'

type VisualBlockControlsOptions = {
  editor: ShallowRef<Editor | null>
  scrollHost: Ref<HTMLDivElement | null>
  blockMenuElement: Ref<HTMLDivElement | null>
  replaceTopLevelNodes: (nodes: ProseMirrorNode[], exactMarkdown?: string) => void
  serializeTopLevelNodes: (editor: Editor, nodes: ProseMirrorNode[]) => string
  updateContextMenu: () => void
}

export function useVisualBlockControls(options: VisualBlockControlsOptions) {
  const activeBlockIndex = ref<number | null>(null)
  const selectedBlockIndices = ref<number[]>([])
  const blockMenuOpen = ref(false)
  const blockTransformMenuOpen = ref(false)
  const blockMenuPosition = ref({ top: 0, left: 0 })
  const isBlockDragging = ref(false)
  const dropBlockIndex = ref<number | null>(null)
  const blockControlsPluginKey = new PluginKey('foldenBlockControls')
  let blockSelectionPinned = false
  let blockAutoScrollFrame: number | null = null
  let blockDragGhost: HTMLDivElement | null = null
  let pointerCaptureElement: HTMLElement | null = null
  let pointerDrag: {
    pointerId: number
    startX: number
    startY: number
    clientX: number
    clientY: number
  } | null = null
  let pendingBlockClickSelection: { activeIndex: number; indices: number[] } | null = null

  function topLevelElements() {
    return options.editor.value
      ? Array.from(
          options.editor.value.view.dom.querySelectorAll<HTMLElement>(
            ':scope > .visual-block-node',
          ),
        )
      : []
  }

  function positionBeforeBlock(index: number) {
    if (!options.editor.value) return 0
    let position = 0
    for (let current = 0; current < index; current += 1) {
      position += options.editor.value.state.doc.child(current).nodeSize
    }
    return position
  }

  function syncBlockDecorations() {
    if (!options.editor.value) return
    options.editor.value.view.dispatch(
      options.editor.value.state.tr
        .setMeta(blockControlsPluginKey, true)
        .setMeta('addToHistory', false),
    )
  }

  function activateBlock(index: number) {
    if (!options.editor.value || index < 0 || index >= options.editor.value.state.doc.childCount)
      return
    blockSelectionPinned = false
    activeBlockIndex.value = index
    if (selectedBlockIndices.value.length === 1 && selectedBlockIndices.value[0] === index) return
    selectedBlockIndices.value = [index]
    syncBlockDecorations()
  }

  function clearBlockSelection() {
    blockSelectionPinned = false
    if (!selectedBlockIndices.value.length) return
    selectedBlockIndices.value = []
    syncBlockDecorations()
  }

  function closeBlockMenu() {
    blockMenuOpen.value = false
    blockTransformMenuOpen.value = false
    blockSelectionPinned = false
    options.updateContextMenu()
  }

  function viewportClampedPosition(element: HTMLElement, position: { top: number; left: number }) {
    const margin = 12
    const rect = element.getBoundingClientRect()
    return {
      top: Math.max(margin, Math.min(position.top, window.innerHeight - rect.height - margin)),
      left: Math.max(margin, Math.min(position.left, window.innerWidth - rect.width - margin)),
    }
  }

  function clampBlockMenuToViewport() {
    if (!options.blockMenuElement.value) return
    blockMenuPosition.value = viewportClampedPosition(
      options.blockMenuElement.value,
      blockMenuPosition.value,
    )
  }

  function openBlockTransformMenu() {
    blockTransformMenuOpen.value = true
    nextTick(clampBlockMenuToViewport)
  }

  function toggleBlockMenu(index: number, anchor: HTMLElement) {
    if (blockMenuOpen.value) {
      closeBlockMenu()
      return
    }
    selectBlock(index)
    const anchorRect = anchor.getBoundingClientRect()
    blockMenuPosition.value = { top: anchorRect.bottom + 4, left: anchorRect.left }
    blockMenuOpen.value = true
    blockTransformMenuOpen.value = false
    options.updateContextMenu()
    nextTick(clampBlockMenuToViewport)
  }

  function createBlockControls(index: number) {
    const controls = document.createElement('div')
    controls.className = 'visual-block-controls'
    controls.contentEditable = 'false'
    controls.dataset.blockIndex = String(index)

    const menuButton = document.createElement('button')
    menuButton.type = 'button'
    menuButton.className = 'visual-block-control visual-block-menu-trigger'
    menuButton.setAttribute('aria-label', 'Block menu')
    menuButton.dataset.testid = 'visual-block-menu-trigger'
    menuButton.innerHTML = '<span class="visual-block-menu-icon" aria-hidden="true">•••</span>'
    menuButton.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    menuButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      toggleBlockMenu(index, menuButton)
    })

    const dragButton = document.createElement('button')
    dragButton.type = 'button'
    dragButton.className = 'visual-block-control visual-block-handle'
    dragButton.setAttribute('aria-label', 'Block actions')
    dragButton.dataset.testid = 'visual-block-handle'
    dragButton.innerHTML = '<span class="visual-block-grip-icon" aria-hidden="true"></span>'
    dragButton.addEventListener('pointerdown', (event) => prepareBlockDrag(event, index))
    dragButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      handleBlockHandleClick()
    })
    controls.append(menuButton, dragButton)
    return controls
  }

  const extension = Extension.create({
    name: 'foldenBlockControls',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: blockControlsPluginKey,
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = []
              state.doc.forEach((node, offset, index) => {
                const selected = selectedBlockIndices.value.includes(index)
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    class: `visual-block-node${selected ? ' visual-block-selected' : ''}`,
                    'data-block-index': String(index),
                  }),
                  Decoration.widget(offset, () => createBlockControls(index), {
                    key: `block-controls-${index}`,
                    side: -1,
                    ignoreSelection: true,
                  }),
                )
              })
              return DecorationSet.create(state.doc, decorations)
            },
          },
        }),
      ]
    },
  })

  function selectBlock(index: number, extend = false) {
    if (!options.editor.value || index < 0 || index >= options.editor.value.state.doc.childCount)
      return
    if (extend && selectedBlockIndices.value.length) {
      const anchor = selectedBlockIndices.value[0]
      const from = Math.min(anchor, index)
      const to = Math.max(anchor, index)
      selectedBlockIndices.value = Array.from(
        { length: to - from + 1 },
        (_, offset) => from + offset,
      )
    } else {
      selectedBlockIndices.value = [index]
    }
    blockSelectionPinned = true
    activeBlockIndex.value = index
    options.editor.value.view.dispatch(
      options.editor.value.state.tr.setSelection(
        NodeSelection.create(options.editor.value.state.doc, positionBeforeBlock(index)),
      ),
    )
    syncBlockDecorations()
  }

  function selectedIndices() {
    return selectedBlockIndices.value.length
      ? [...selectedBlockIndices.value].sort((left, right) => left - right)
      : activeBlockIndex.value === null
        ? []
        : [activeBlockIndex.value]
  }

  function moveSelectedBlocks(targetIndex: number) {
    if (!options.editor.value) return
    const indices = selectedIndices()
    if (!indices.length) return
    const selected = new Set(indices)
    const nodes = Array.from({ length: options.editor.value.state.doc.childCount }, (_, index) =>
      options.editor.value!.state.doc.child(index),
    )
    const moving = nodes.filter((_, index) => selected.has(index))
    const remaining = nodes.filter((_, index) => !selected.has(index))
    const removedBefore = indices.filter((index) => index < targetIndex).length
    const insertion = Math.max(0, Math.min(targetIndex - removedBefore, remaining.length))
    const reordered = [...remaining.slice(0, insertion), ...moving, ...remaining.slice(insertion)]
    if (nodes.every((node, index) => node === reordered[index])) return
    options.replaceTopLevelNodes(
      reordered,
      options.serializeTopLevelNodes(options.editor.value, reordered),
    )
    selectedBlockIndices.value = moving.map((_, offset) => insertion + offset)
    activeBlockIndex.value = insertion
    syncBlockDecorations()
  }

  function duplicateSelectedBlocks() {
    if (!options.editor.value) return
    const indices = selectedIndices()
    if (!indices.length) return
    const nodes = Array.from({ length: options.editor.value.state.doc.childCount }, (_, index) =>
      options.editor.value!.state.doc.child(index),
    )
    const copies = indices.map((index) => nodes[index].copy(nodes[index].content))
    const insertion = indices.at(-1)! + 1
    options.replaceTopLevelNodes([
      ...nodes.slice(0, insertion),
      ...copies,
      ...nodes.slice(insertion),
    ])
    selectedBlockIndices.value = copies.map((_, offset) => insertion + offset)
    activeBlockIndex.value = insertion
    closeBlockMenu()
    syncBlockDecorations()
  }

  function deleteSelectedBlocks() {
    if (!options.editor.value) return
    const selected = new Set(selectedIndices())
    if (!selected.size) return
    const nodes = Array.from({ length: options.editor.value.state.doc.childCount }, (_, index) =>
      options.editor.value!.state.doc.child(index),
    ).filter((_, index) => !selected.has(index))
    options.replaceTopLevelNodes(
      nodes.length ? nodes : [options.editor.value.schema.nodes.paragraph.create()],
    )
    selectedBlockIndices.value = []
    activeBlockIndex.value = null
    closeBlockMenu()
    syncBlockDecorations()
  }

  function insertBlock(relative: 'above' | 'below') {
    if (!options.editor.value || activeBlockIndex.value === null) return
    const index = activeBlockIndex.value + (relative === 'below' ? 1 : 0)
    const position = positionBeforeBlock(index)
    options.editor.value.commands.insertContentAt(position, { type: 'paragraph' })
    closeBlockMenu()
    clearBlockSelection()
    activeBlockIndex.value = index
    options.editor.value
      .chain()
      .focus()
      .setTextSelection(position + 1)
      .run()
  }

  function removeBlockPointerListeners() {
    window.removeEventListener('pointermove', handleBlockPointerMove)
    window.removeEventListener('pointerup', handleBlockPointerUp)
    window.removeEventListener('pointercancel', cancelBlockPointerDrag)
    window.removeEventListener('blur', cancelBlockPointerDrag)
  }

  function stopBlockAutoScroll() {
    if (blockAutoScrollFrame !== null) cancelAnimationFrame(blockAutoScrollFrame)
    blockAutoScrollFrame = null
  }

  function finishBlockDrag() {
    removeBlockPointerListeners()
    stopBlockAutoScroll()
    if (
      pointerCaptureElement &&
      pointerDrag &&
      pointerCaptureElement.hasPointerCapture(pointerDrag.pointerId)
    ) {
      pointerCaptureElement.releasePointerCapture(pointerDrag.pointerId)
    }
    pointerCaptureElement = null
    isBlockDragging.value = false
    dropBlockIndex.value = null
    blockDragGhost?.remove()
    blockDragGhost = null
    pointerDrag = null
    syncBlockDecorations()
  }

  function prepareBlockDrag(event: PointerEvent, index: number) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (blockMenuOpen.value) closeBlockMenu()
    options.editor.value?.view.focus()
    activeBlockIndex.value = index
    if (!selectedBlockIndices.value.includes(index) || event.shiftKey)
      selectBlock(index, event.shiftKey)
    pendingBlockClickSelection = { activeIndex: index, indices: [...selectedBlockIndices.value] }
    pointerDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
    }
    pointerCaptureElement = event.currentTarget as HTMLElement
    pointerCaptureElement.setPointerCapture?.(event.pointerId)
    window.addEventListener('pointermove', handleBlockPointerMove, { passive: false })
    window.addEventListener('pointerup', handleBlockPointerUp)
    window.addEventListener('pointercancel', cancelBlockPointerDrag)
    window.addEventListener('blur', cancelBlockPointerDrag)
  }

  function createBlockDragGhost() {
    const ghost = document.createElement('div')
    ghost.className = 'visual-block-drag-ghost'
    ghost.textContent = `${selectedIndices().length} block${selectedIndices().length === 1 ? '' : 's'}`
    document.body.append(ghost)
    blockDragGhost = ghost
  }

  function updateBlockDropTarget(clientY: number) {
    const blocks = topLevelElements()
    const firstAfterPointer = blocks.findIndex((block) => {
      const rect = block.getBoundingClientRect()
      return clientY < rect.top + rect.height / 2
    })
    dropBlockIndex.value = firstAfterPointer < 0 ? blocks.length : firstAfterPointer
  }

  function blockAutoScrollDelta(clientY: number) {
    const viewport = options.scrollHost.value?.getBoundingClientRect()
    if (!viewport) return 0
    if (clientY < viewport.top + 48) return -14
    if (clientY > viewport.bottom - 48) return 14
    return 0
  }

  function runBlockAutoScroll() {
    blockAutoScrollFrame = null
    if (!pointerDrag || !isBlockDragging.value || !options.scrollHost.value) return
    const delta = blockAutoScrollDelta(pointerDrag.clientY)
    if (!delta) return
    options.scrollHost.value.scrollBy({ top: delta })
    updateBlockDropTarget(pointerDrag.clientY)
    blockAutoScrollFrame = requestAnimationFrame(runBlockAutoScroll)
  }

  function updateBlockDragAt(clientX: number, clientY: number) {
    if (blockDragGhost) {
      blockDragGhost.style.transform = `translate3d(${clientX + 14}px, ${clientY + 14}px, 0)`
    }
    updateBlockDropTarget(clientY)
    if (blockAutoScrollDelta(clientY)) {
      if (blockAutoScrollFrame === null)
        blockAutoScrollFrame = requestAnimationFrame(runBlockAutoScroll)
    } else {
      stopBlockAutoScroll()
    }
  }

  function handleBlockPointerMove(event: PointerEvent) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
    pointerDrag.clientX = event.clientX
    pointerDrag.clientY = event.clientY
    if (!isBlockDragging.value) {
      const distance = Math.hypot(
        event.clientX - pointerDrag.startX,
        event.clientY - pointerDrag.startY,
      )
      if (distance < 5) return
      isBlockDragging.value = true
      pendingBlockClickSelection = null
      createBlockDragGhost()
    }
    event.preventDefault()
    updateBlockDragAt(event.clientX, event.clientY)
  }

  function handleBlockPointerUp(event: PointerEvent) {
    if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return
    if (isBlockDragging.value && dropBlockIndex.value !== null)
      moveSelectedBlocks(dropBlockIndex.value)
    finishBlockDrag()
  }

  function cancelBlockPointerDrag() {
    pendingBlockClickSelection = null
    finishBlockDrag()
  }

  function handleBlockHandleClick() {
    const pendingSelection = pendingBlockClickSelection
    pendingBlockClickSelection = null
    if (!options.editor.value || !pendingSelection) return
    requestAnimationFrame(() => {
      if (!options.editor.value) return
      options.editor.value.view.focus()
      selectedBlockIndices.value = pendingSelection.indices
      activeBlockIndex.value = pendingSelection.activeIndex
      options.editor.value.view.dispatch(
        options.editor.value.state.tr.setSelection(
          NodeSelection.create(
            options.editor.value.state.doc,
            positionBeforeBlock(pendingSelection.activeIndex),
          ),
        ),
      )
      syncBlockDecorations()
    })
  }

  function prepareFrameKeydown(event: KeyboardEvent) {
    const keepsBlockSelection =
      event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    const modifierOnly = ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)
    if (blockSelectionPinned && !blockMenuOpen.value && !keepsBlockSelection && !modifierOnly) {
      clearBlockSelection()
    }
  }

  function handleBlockKeydown(event: KeyboardEvent) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return false
    const index =
      activeBlockIndex.value ?? options.editor.value?.state.selection.$from.index(0) ?? 0
    selectBlock(index)
    moveSelectedBlocks(event.key === 'ArrowUp' ? index - 1 : index + 2)
    return true
  }

  function markBlockInput(event: Event) {
    if (event.type !== 'pointerdown') return
    const target = event.target as HTMLElement | null
    if (
      blockMenuOpen.value &&
      target?.closest('.tiptap') &&
      !target.closest('.visual-block-menu-trigger')
    ) {
      closeBlockMenu()
    }
    const block = target?.closest<HTMLElement>('.visual-block-node')
    const index = Number(block?.dataset.blockIndex)
    if (block && Number.isInteger(index)) activateBlock(index)
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!blockMenuOpen.value) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.visual-block-menu, .visual-block-menu-trigger')) return
    closeBlockMenu()
  }

  function handleDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !blockMenuOpen.value) return
    event.preventDefault()
    closeBlockMenu()
  }

  return {
    activeBlockIndex,
    selectedBlockIndices,
    blockMenuOpen,
    blockTransformMenuOpen,
    blockMenuPosition,
    isBlockDragging,
    dropBlockIndex,
    extension,
    activateBlock,
    clearBlockSelection,
    closeBlockMenu,
    clampBlockMenuToViewport,
    openBlockTransformMenu,
    duplicateSelectedBlocks,
    deleteSelectedBlocks,
    insertBlock,
    prepareFrameKeydown,
    handleBlockKeydown,
    markBlockInput,
    handleDocumentPointerDown,
    handleDocumentKeydown,
    finishBlockDrag,
    topLevelElements,
  }
}
