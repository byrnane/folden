type FitLabelState = {
  observer: ResizeObserver
  frame: number
}

const fitLabelStates = new WeakMap<HTMLElement, FitLabelState>()

function measureLabelFit(button: HTMLElement) {
  const label = button.querySelector<HTMLElement>('span')

  if (!label) {
    button.classList.remove('label-hidden')
    return
  }

  button.classList.remove('label-hidden')

  const style = window.getComputedStyle(button)
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  const gap = parseFloat(style.columnGap || style.gap || '0') || 0
  const iconWidth = [...button.children]
    .filter((child) => child !== label)
    .reduce((total, child) => total + child.getBoundingClientRect().width, 0)
  const requiredWidth = padding + iconWidth + gap + label.scrollWidth

  button.classList.toggle('label-hidden', requiredWidth > button.clientWidth + 1)
}

function queueFitLabelUpdate(button: HTMLElement) {
  const state = fitLabelStates.get(button)

  if (!state) {
    return
  }

  if (state.frame) {
    cancelAnimationFrame(state.frame)
  }

  state.frame = requestAnimationFrame(() => {
    state.frame = 0
    measureLabelFit(button)
  })
}

export const vFitLabel = {
  mounted(button: HTMLElement) {
    const observer = new ResizeObserver(() => queueFitLabelUpdate(button))
    fitLabelStates.set(button, {
      observer,
      frame: 0,
    })
    observer.observe(button)
    queueFitLabelUpdate(button)
  },
  updated(button: HTMLElement) {
    queueFitLabelUpdate(button)
  },
  beforeUnmount(button: HTMLElement) {
    const state = fitLabelStates.get(button)

    if (!state) {
      return
    }

    if (state.frame) {
      cancelAnimationFrame(state.frame)
    }

    state.observer.disconnect()
    fitLabelStates.delete(button)
  },
}
