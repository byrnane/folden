import { createApp } from 'vue'
import App from './App.vue'
import { logFrontendEvent } from './infrastructure/tauri/files'
import '@fontsource-variable/inter/wght.css'
import './assets/themes/folden-dark.css'
import './assets/styles/app.css'

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window
}

function describeUnknownError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 400)
  }

  return String(error).slice(0, 400)
}

if (isTauriRuntime()) {
  window.addEventListener('error', (event) => {
    void logFrontendEvent('error', `window.error ${event.message}`.slice(0, 400))
  })

  window.addEventListener('unhandledrejection', (event) => {
    void logFrontendEvent('error', `unhandledrejection ${describeUnknownError(event.reason)}`)
  })
}

createApp(App).mount('#app')
