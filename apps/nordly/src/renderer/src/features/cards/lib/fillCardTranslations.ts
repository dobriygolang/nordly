import type { ViewUpdate } from '@codemirror/view';

import { markdownLines } from '@nordly-markdown/proseLines';

import {
  lineWithTranslation,
  splitCardColonLine,
  translateCardFront,
  translationPair,
} from './cardTranslation';

const reportedTranslationErrors = new WeakSet<Promise<string>>();

export function fillCardTranslations(
  update: ViewUpdate,
  opts: {
    enabled: boolean;
    applying: { current: boolean };
    onError: (err: unknown) => void;
  },
): void {
  if (!opts.enabled || opts.applying.current) return;
  let addedColon = false;
  update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes(':')) addedColon = true;
  });
  if (!addedColon) return;
  const rows = markdownLines(update.state.doc.toString());
  const seen = new Set<number>();
  update.changes.iterChanges((_fromA, _toA, fromB, toB) => {
    const start = update.state.doc.lineAt(fromB).number;
    const end = update.state.doc.lineAt(Math.max(fromB, toB)).number;
    for (let number = start; number <= end; number += 1) seen.add(number);
  });
  for (const number of seen) {
    const row = rows[number - 1];
    if (!row || row.inFence) continue;
    const split = splitCardColonLine(row.text);
    if (!split || split.back || !translationPair(split.front)) continue;
    const front = split.front;
    const pending = translateCardFront(front);
    void pending
      .then((translation) => {
        const view = update.view;
        if (opts.applying.current || number < 1 || number > view.state.doc.lines) return;
        const line = view.state.doc.line(number);
        const current = splitCardColonLine(line.text);
        if (!current || current.front !== front) return;
        const next = lineWithTranslation(line.text, translation);
        if (!next || next === line.text) return;
        const head = view.state.selection.main.head;
        const onLine = head >= line.from && head <= line.to;
        opts.applying.current = true;
        try {
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: next },
            selection: onLine ? { anchor: line.from + next.length } : undefined,
          });
        } finally {
          opts.applying.current = false;
        }
      })
      .catch((err: unknown) => {
        if (reportedTranslationErrors.has(pending)) return;
        reportedTranslationErrors.add(pending);
        opts.onError(err instanceof Error ? err : new Error('MyMemory returned no translation'));
      });
  }
}
