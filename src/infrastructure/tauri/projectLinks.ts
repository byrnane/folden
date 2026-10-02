import { invokeNative } from './files'

export function openProjectLink(link: 'help' | 'releases' | 'issues' | 'repository') {
  return invokeNative<void>('open_project_link', { link })
}
