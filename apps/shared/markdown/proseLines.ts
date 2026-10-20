/** One slice of a markdown line that is outside fenced blocks and inline code. */
export interface ProseSegment {
  /** 1-based line number in the original note. */
  line: number;
  text: string;
}

export interface MarkdownLine {
  /** 1-based line number in the original note. */
  line: number;
  text: string;
  /** Index of `text` in the original note. */
  offset: number;
  inFence: boolean;
}

const FENCE = /^(`{3,})([^`]*)$/;

/** Lines of the note. A fence stays open until a closing run at least as long, with no info string. */
export function markdownLines(bodyMd: string): MarkdownLine[] {
  const lines = bodyMd.split('\n');
  const out: MarkdownLine[] = [];
  let offset = 0;
  let open = '';
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index] ?? '';
    const fence = fenceRun(text);
    let inFence = open.length > 0;
    if (open.length > 0) {
      if (fence && fence.ticks.length >= open.length && fence.rest.trim() === '') open = '';
    } else if (fence) {
      open = fence.ticks;
      inFence = true;
    }
    out.push({ line: index + 1, text, offset, inFence });
    offset += text.length + 1;
  }
  return out;
}

/** Lines of prose, split on inline backticks. Fenced blocks are omitted. */
export function proseSegments(bodyMd: string): ProseSegment[] {
  const segments: ProseSegment[] = [];
  for (const row of markdownLines(bodyMd)) {
    if (row.inFence) continue;
    const parts = row.text.split('`');
    for (let part = 0; part < parts.length; part += 2) {
      segments.push({ line: row.line, text: parts[part] ?? '' });
    }
  }
  return segments;
}

function fenceRun(line: string): { ticks: string; rest: string } | null {
  const match = FENCE.exec(line.trimStart());
  if (!match) return null;
  return { ticks: match[1] ?? '', rest: match[2] ?? '' };
}
