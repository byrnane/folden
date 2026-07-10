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
  layoutSettingLimits,
  type ActivityRailMode,
  type ActivitySection,
} from '../../application/settings'
import { activityRailResizeThresholds } from './activityRailResizeThresholds'
import { uiIconSizes } from '../uiConstants'

const railKeyboardStepPx = 16
const railKeyboardLargeStepPx = 64

const props = defineProps<{
  activeSection: ActivitySection
  mode: ActivityRailMode
  compactWidth: number
  expandedWidth: number
}>()

const emit = defineEmits<{
  setSection: [section: ActivitySection]
  setMode: [mode: ActivityRailMode]
  setWidth: [width: number]
  resetWidth: []
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
const currentWidth = computed(() => props.mode === 'expanded' ? props.expandedWidth : props.compactWidth)
const currentWidthLimits = computed(() => props.mode === 'expanded'
  ? layoutSettingLimits.activityExpandedWidth
  : layoutSettingLimits.activityCompactWidth)

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
  window.addEventListener('mouseup', stopResize)
}

function applyResizeWidth(mode: ActivityRailMode, nextWidth: number) {
  if (mode === 'compact') {
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

function resize(event: MouseEvent) {
  const start = resizeStart.value

  if (!start) {
    return
  }

  const delta = event.clientX - start.x
  const baseWidth = start.mode === 'expanded' ? start.expandedWidth : start.compactWidth
  applyResizeWidth(start.mode, baseWidth + delta)
}

function stopResize() {
  resizeStart.value = null
  window.removeEventListener('mousemove', resize)
  window.removeEventListener('mouseup', stopResize)
}

function resizeWithKeyboard(event: KeyboardEvent) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }

  event.preventDefault()
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const step = event.shiftKey ? railKeyboardLargeStepPx : railKeyboardStepPx
  const nextWidth = currentWidth.value + direction * step

  if (
    props.mode === 'compact'
    && direction > 0
    && nextWidth >= layoutSettingLimits.activityCompactWidth.max
  ) {
    emit('setMode', 'expanded')
    emit('setWidth', layoutSettingLimits.activityExpandedWidth.min)
    return
  }

  applyResizeWidth(props.mode, nextWidth)
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
        :class="{ active: activeSection === 'search' }"
        @click="emit('setSection', 'search')"
      >
        <Search :size="uiIconSizes.activityRail" />
        <span>Search</span>
      </button>
      <button
        type="button"
        class="activity-button"
        :class="{ active: activeSection === 'create' }"
        title="Create"
        aria-label="Create"
        @click="emit('setSection', 'create')"
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
    tabindex="0"
    aria-orientation="vertical"
    :aria-valuemin="currentWidthLimits.min"
    :aria-valuemax="currentWidthLimits.max"
    :aria-valuenow="currentWidth"
    @mousedown.prevent="beginResize"
    @keydown="resizeWithKeyboard"
    @dblclick="emit('resetWidth')"
  />
</template>
