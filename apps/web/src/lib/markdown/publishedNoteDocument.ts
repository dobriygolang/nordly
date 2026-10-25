import { renderNordlyMarkdown } from './renderNordlyMarkdown'

export interface PublishedNoteHeading {
  id: string
  text: string
  level: number
}

/** Build navigation from the rendered document so fenced code never becomes a section. */
export function publishedNoteDocument(bodyMd: string) {
  const document = new DOMParser().parseFromString(renderNordlyMarkdown(bodyMd), 'text/html')
  const headings: PublishedNoteHeading[] = []
  document.body.querySelectorAll('h1, h2, h3').forEach((heading, index) => {
    const id = `note-section-${index + 1}`
    heading.id = id
    const text = heading.textContent?.trim() ?? ''
    if (text) headings.push({ id, text, level: Number(heading.tagName.slice(1)) })
  })
  const words = Array.from(document.body.children).map((element) => element.textContent).join(' ').trim().split(/\s+/u).filter(Boolean).length
  return { html: document.body.innerHTML, headings, readingMinutes: Math.max(1, Math.ceil(words / 220)) }
}
