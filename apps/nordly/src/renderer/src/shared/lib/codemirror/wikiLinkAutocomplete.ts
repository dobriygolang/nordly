import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

import { wikiCompletions } from '@nordly-markdown/wikiTarget';

export function wikiLinkAutocomplete(noteTitles: string[], boardTitles: string[] = []) {
  return autocompletion({
    override: [(context: CompletionContext): CompletionResult | null => {
      const before = context.matchBefore(/\[\[[^\]|\n]*/);
      if (!before || !before.text.startsWith('[[')) return null;
      if (before.from === before.to && !context.explicit) return null;

      const typed = before.text.slice(2);
      const options = wikiCompletions(typed, noteTitles, boardTitles);
      if (!options) return null;
      const keep = options[0]?.keep ?? 0;

      return {
        from: before.from + 2 + keep,
        options: options.map((option) => ({
          label: option.label,
          type: 'text' as const,
          apply: option.apply,
        })),
        validFor: /^[^\]|\n]*$/,
      };
    }],
  });
}
