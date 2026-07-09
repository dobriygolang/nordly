import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

export function wikiLinkAutocomplete(noteTitles: string[]) {
  return autocompletion({
    override: [(context: CompletionContext): CompletionResult | null => {
      const before = context.matchBefore(/\[\[[^\]|]*/);
      if (!before || !before.text.startsWith('[[')) return null;
      if (before.from === before.to && !context.explicit) return null;

      const query = before.text.slice(2).trim().toLowerCase();
      const options = noteTitles
        .filter((title) => title.trim().length > 0)
        .filter((title) => title.toLowerCase().includes(query))
        .slice(0, 12)
        .map((title) => ({
          label: title,
          type: 'text' as const,
          apply: `${title}]]`,
        }));

      if (options.length === 0) return null;

      return {
        from: before.from + 2,
        options,
        validFor: /^[^\]|]*$/,
      };
    }],
  });
}
