export const availableThemes = [
  {
    id: 'folden-dark',
    label: 'Folden Dark',
    colorScheme: 'dark',
  },
] as const

export type ThemeId = (typeof availableThemes)[number]['id']

export const defaultThemeId: ThemeId = 'folden-dark'

export function isThemeId(value: unknown): value is ThemeId {
  return availableThemes.some((theme) => theme.id === value)
}
