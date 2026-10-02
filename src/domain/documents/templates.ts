export type DocumentTemplate = 'empty' | 'note' | 'game' | 'video'
export function templateContent(template: DocumentTemplate, title: string, language: 'ru' | 'en') {
  if (template === 'empty') return ''
  const sections = {
    ru: {
      note: [],
      game: ['Концепция', 'Игровой цикл', 'Механики', 'Контент', 'Открытые вопросы'],
      video: ['Идея', 'Вступление', 'Основная часть', 'Финал', 'Материалы'],
    },
    en: {
      note: [],
      game: ['Concept', 'Core loop', 'Mechanics', 'Content', 'Open questions'],
      video: ['Idea', 'Introduction', 'Main part', 'Ending', 'Sources'],
    },
  }
  return `# ${title}\n\n${sections[language][template].map((section) => `## ${section}\n\n`).join('')}`
}
