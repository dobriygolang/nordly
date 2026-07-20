/**
 * Nordly-flavored markdown → safe HTML for published notes.
 * Parity with desktop live preview: GFM basics + ==highlight== + [[wiki links]].
 * No raw HTML from markdown (escaped).
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function safeHref(url: string): string | null {
  const trimmed = url.trim()
  if (/^https:\/\//i.test(trimmed)) return trimmed
  if (/^mailto:/i.test(trimmed)) return trimmed
  // Published note assets (same-origin relative path).
  if (/^\/v1\/notes\/public\/[^/]+\/assets\/[^/?#]+$/i.test(trimmed)) return trimmed
  return null
}

function safeImageSrc(url: string): string | null {
  const trimmed = url.trim()
  if (/^https:\/\//i.test(trimmed)) return trimmed
  if (/^\/v1\/notes\/public\/[^/]+\/assets\/[^/?#]+$/i.test(trimmed)) return trimmed
  if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(trimmed)) return trimmed
  return null
}

/** Inline markdown → HTML (bold, italic, code, links, images, highlight, wiki). */
export function renderInlineMarkdown(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    // Wiki [[title]] or [[title|alias]]
    if (src[i] === '[' && src[i + 1] === '[') {
      const end = src.indexOf(']]', i + 2)
      if (end !== -1) {
        const inner = src.slice(i + 2, end)
        const pipe = inner.indexOf('|')
        const target = (pipe === -1 ? inner : inner.slice(0, pipe)).trim()
        const label = (pipe === -1 ? inner : inner.slice(pipe + 1)).trim() || target
        out += `<span class="nordly-md-wiki-link nordly-md-wiki-link--unresolved">${escapeHtml(label)}</span>`
        i = end + 2
        continue
      }
    }

    // Highlight ==text==
    if (src[i] === '=' && src[i + 1] === '=') {
      const end = src.indexOf('==', i + 2)
      if (end !== -1 && end > i + 2) {
        out += `<mark class="nordly-md-highlight">${renderInlineMarkdown(src.slice(i + 2, end))}</mark>`
        i = end + 2
        continue
      }
    }

    // Inline code `code`
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1)
      if (end !== -1) {
        out += `<code class="nordly-md-inline-code">${escapeHtml(src.slice(i + 1, end))}</code>`
        i = end + 1
        continue
      }
    }

    // Image ![alt](url) — before links
    if (src[i] === '!' && src[i + 1] === '[') {
      const labelEnd = src.indexOf(']', i + 2)
      if (labelEnd !== -1 && src[labelEnd + 1] === '(') {
        const urlEnd = src.indexOf(')', labelEnd + 2)
        if (urlEnd !== -1) {
          const alt = src.slice(i + 2, labelEnd)
          const srcHref = safeImageSrc(src.slice(labelEnd + 2, urlEnd))
          if (srcHref) {
            out += `<img class="nordly-md-image" src="${escapeHtml(srcHref)}" alt="${escapeHtml(alt)}" loading="lazy" />`
            i = urlEnd + 1
            continue
          }
        }
      }
    }

    // Link [label](url)
    if (src[i] === '[') {
      const labelEnd = src.indexOf(']', i + 1)
      if (labelEnd !== -1 && src[labelEnd + 1] === '(') {
        const urlEnd = src.indexOf(')', labelEnd + 2)
        if (urlEnd !== -1) {
          const label = src.slice(i + 1, labelEnd)
          const href = safeHref(src.slice(labelEnd + 2, urlEnd))
          if (href) {
            out += `<a class="nordly-md-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInlineMarkdown(label)}</a>`
            i = urlEnd + 1
            continue
          }
        }
      }
    }

    // Bold ** or __
    if ((src[i] === '*' && src[i + 1] === '*') || (src[i] === '_' && src[i + 1] === '_')) {
      const delim = src.slice(i, i + 2)
      const end = src.indexOf(delim, i + 2)
      if (end !== -1 && end > i + 2) {
        out += `<strong class="nordly-md-bold">${renderInlineMarkdown(src.slice(i + 2, end))}</strong>`
        i = end + 2
        continue
      }
    }

    // Strike ~~
    if (src[i] === '~' && src[i + 1] === '~') {
      const end = src.indexOf('~~', i + 2)
      if (end !== -1 && end > i + 2) {
        out += `<del class="nordly-md-strike">${renderInlineMarkdown(src.slice(i + 2, end))}</del>`
        i = end + 2
        continue
      }
    }

    // Italic * or _ (single)
    if (src[i] === '*' || src[i] === '_') {
      const delim = src[i]
      const end = src.indexOf(delim, i + 1)
      if (end !== -1 && end > i + 1 && src[end + 1] !== delim) {
        out += `<em class="nordly-md-italic">${renderInlineMarkdown(src.slice(i + 1, end))}</em>`
        i = end + 1
        continue
      }
    }

    out += escapeHtml(src[i]!)
    i += 1
  }
  return out
}

function isHr(line: string): boolean {
  return /^(?:---+|\*\*\*+|___+)\s*$/.test(line.trim())
}

function headingLevel(line: string): number | null {
  const m = /^(#{1,6})\s+(.*)$/.exec(line)
  if (!m) return null
  return m[1]!.length
}

function parseTask(line: string): { checked: boolean; text: string } | null {
  const m = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
  if (!m) return null
  return { checked: m[1]!.toLowerCase() === 'x', text: m[2]! }
}

function parseBullet(line: string): string | null {
  const m = /^[-*+]\s+(.*)$/.exec(line)
  return m ? m[1]! : null
}

function parseOrdered(line: string): { num: string; text: string } | null {
  const m = /^(\d+)\.\s+(.*)$/.exec(line)
  if (!m) return null
  return { num: m[1]!, text: m[2]! }
}

/** Full note body markdown → HTML string. */
export function renderNordlyMarkdown(bodyMd: string): string {
  const lines = bodyMd.replace(/\r\n/g, '\n').split('\n')
  const html: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]!

    // Fence
    const fence = /^```([\w+-]*)\s*$/.exec(line)
    if (fence) {
      const lang = fence[1] ?? ''
      const code: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        code.push(lines[i]!)
        i += 1
      }
      if (i < lines.length) i += 1
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : ''
      const langBadge = lang
        ? `<div class="nordly-md-code-block__lang-bar" aria-hidden="true"><span class="nordly-md-code-block__lang">${escapeHtml(lang)}</span></div>`
        : ''
      html.push(
        `<pre class="nordly-md-code-block"${langAttr}>${langBadge}<code>${escapeHtml(code.join('\n'))}</code></pre>`,
      )
      continue
    }

    // Blank
    if (line.trim() === '') {
      i += 1
      continue
    }

    // HR
    if (isHr(line)) {
      html.push('<hr class="nordly-md-hr" />')
      i += 1
      continue
    }

    // Heading
    const level = headingLevel(line)
    if (level !== null) {
      const text = line.replace(/^#{1,6}\s+/, '')
      html.push(`<h${level} class="nordly-md-h${level}">${renderInlineMarkdown(text)}</h${level}>`)
      i += 1
      continue
    }

    // Blockquote (contiguous > lines)
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quote.push(lines[i]!.replace(/^>\s?/, ''))
        i += 1
      }
      html.push(
        `<blockquote class="nordly-md-quote">${quote.map((q) => `<p>${renderInlineMarkdown(q)}</p>`).join('')}</blockquote>`,
      )
      continue
    }

    // Task / unordered list
    if (parseTask(line) || parseBullet(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const task = parseTask(lines[i]!)
        if (task) {
          const checked = task.checked ? ' nordly-md-checkbox-marker--checked' : ''
          items.push(
            `<li class="nordly-md-list-item nordly-md-task"><span class="nordly-md-checkbox-marker${checked}" aria-hidden="true"></span><span>${renderInlineMarkdown(task.text)}</span></li>`,
          )
          i += 1
          continue
        }
        const bullet = parseBullet(lines[i]!)
        if (bullet !== null) {
          items.push(
            `<li class="nordly-md-list-item"><span class="nordly-md-bullet" aria-hidden="true">•</span><span>${renderInlineMarkdown(bullet)}</span></li>`,
          )
          i += 1
          continue
        }
        break
      }
      html.push(`<ul class="nordly-md-ul">${items.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (parseOrdered(line)) {
      const items: string[] = []
      while (i < lines.length) {
        const ordered = parseOrdered(lines[i]!)
        if (!ordered) break
        items.push(
          `<li class="nordly-md-list-item"><span class="nordly-md-list-num" aria-hidden="true">${escapeHtml(ordered.num)}.</span><span>${renderInlineMarkdown(ordered.text)}</span></li>`,
        )
        i += 1
      }
      html.push(`<ol class="nordly-md-ol">${items.join('')}</ol>`)
      continue
    }

    // Paragraph (merge until blank / block start)
    const para: string[] = []
    while (i < lines.length) {
      const l = lines[i]!
      if (l.trim() === '') break
      if (isHr(l) || headingLevel(l) !== null || /^>\s?/.test(l) || /^```/.test(l)) break
      if (parseTask(l) || parseBullet(l) || parseOrdered(l)) break
      para.push(l)
      i += 1
    }
    html.push(`<p>${renderInlineMarkdown(para.join('\n')).replace(/\n/g, '<br />')}</p>`)
  }

  return html.join('')
}
