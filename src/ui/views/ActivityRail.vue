<script setup lang="ts">
import {
  FilePenLine,
  LayoutPanelLeft,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  Settings,
} from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  activityRailResizeThresholds,
  type ActivityRailMode,
  type ActivitySection,
} from '../../infrastructure/settings/settings'
import { uiIconSizes } from '../uiConstants'

const props = defineProps<{
  activeSection: ActivitySection
  mode: ActivityRailMode
  compactWidth: number
  expandedWidth: number
  canCreateDocument: boolean
}>()

const emit = defineEmits<{
  setSection: [section: ActivitySection]
  setMode: [mode: ActivityRailMode]
  setWidth: [width: number]
  resetWidth: []
  createDocument: []
}>()

type ResizeStart = {
  x: number
  mode: ActivityRailMode
  compactWidth: number
  expandedWidth: number
}

const resizeStart = ref<ResizeStart | null>(null)

const modeLabel = computed(() => props.mode === 'expanded' ? 'Collapse rail' : 'Expand rail')
const modeIcon = computed(() => props.mode === 'expanded' ? PanelRightOpen : PanelLeftOpen)

function toggleMode() {
  emit('setMode', props.mode === 'expanded' ? 'compact' : 'expanded')
}

function beginResize(event: MouseEvent) {
  resizeStart.value = {
    x: event.clientX,
    mode: props.mode,
    compactWidth: props.compactWidth,
    expandedWidth: props.expandedWidth,
  }
  window.addEventListener('mousemove', resize)
  window.addEventListener('mouseup', stopResize, { once: true })
}

function resize(event: MouseEvent) {
  const start = resizeStart.value

  if (!start) {
    return
  }

  const delta = event.clientX - start.x
  const baseWidth = start.mode === 'expanded' ? start.expandedWidth : start.compactWidth
  const nextWidth = baseWidth + delta

  if (start.mode === 'compact') {
    if (nextWidth > activityRailResizeThresholds.expandFromCompactWidth) {
      emit('setMode', 'expanded')
      emit('setWidth', nextWidth)
      return
    }

    emit('setMode', 'compact')
    emit('setWidth', nextWidth)
    return
  }

  if (nextWidth < activityRailResizeThresholds.collapseFromExpandedWidth) {
    emit('setMode', 'compact')
    emit('setWidth', nextWidth)
    return
  }

  emit('setMode', 'expanded')
  emit('setWidth', nextWidth)
}

function stopResize() {
  resizeStart.value = null
  window.removeEventListener('mousemove', resize)
}

onBeforeUnmount(() => {
  stopResize()
})
</script>

<template>
  <nav
    class="activity-bar"
    :class="`activity-${mode}`"
    aria-label="Activity"
    :data-activity-mode="mode"
  >
    <div class="activity-main-items">
      <button
        type="button"
        class="activity-button"
        :class="{ active: activeSection === 'workspace' }"
        title="Workspace"
        aria-label="Workspace"
        @click="emit('setSection', 'workspace')"
      >
        <LayoutPanelLeft :size="uiIconSizes.activityRail" />
        <span>Workspace</span>
      </button>
      <button
        type="button"
        class="activity-button"
        title="Search"
        aria-label="Search"
        disabled
      >
        <Search :size="uiIconSizes.activityRail" />
        <span>Search</span>
      </button>
      <button
        type="button"
        class="activity-button"
        title="New scratch document"
        aria-label="New scratch document"
        :disabled="!canCreateDocument"
        @click="emit('createDocument')"
      >
        <FilePenLine :size="uiIconSizes.activityRail" />
        <span>Create</span>
      </button>
      <button
        type="button"
        class="activity-button"
        :class="{ active: activeSection === 'settings' }"
        title="Settings"
        aria-label="Settings"
        @click="emit('setSection', 'settings')"
      >
        <Settings :size="uiIconSizes.activityRail" />
        <span>Settings</span>
      </button>
    </div>
    <button
      type="button"
      class="activity-button activity-toggle-button"
      :title="modeLabel"
      :aria-label="modeLabel"
      @click="toggleMode"
    >
      <component :is="modeIcon" :size="uiIconSizes.activityRail" />
      <span>{{ modeLabel }}</span>
    </button>
  </nav>

  <div
    class="activity-splitter"
    data-testid="activity-splitter"
    role="separator"
    aria-label="Resize activity bar"
    @mousedown.prevent="beginResize"
    @dblclick="emit('resetWidth')"
  />
</template>
