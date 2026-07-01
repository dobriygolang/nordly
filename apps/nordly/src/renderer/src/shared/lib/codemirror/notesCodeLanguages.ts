import { go } from '@codemirror/lang-go';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, LanguageDescription, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/** Same four langs as live rooms — ids match ``` fence info strings. */
export const NOTES_CODE_LANGS = [
  { id: 'go', label: 'go', aliases: ['golang'] },
  { id: 'python', label: 'python', aliases: ['py'] },
  { id: 'javascript', label: 'javascript', aliases: ['js'] },
  { id: 'typescript', label: 'typescript', aliases: ['ts'] },
] as const;

export type NotesCodeLangId = (typeof NOTES_CODE_LANGS)[number]['id'];

const LABELS: Record<NotesCodeLangId, string> = {
  go: 'go',
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
};

export function normalizeNotesCodeLang(info: string): NotesCodeLangId | null {
  const raw = info.trim().toLowerCase();
  if (!raw) return null;
  for (const lang of NOTES_CODE_LANGS) {
    if (raw === lang.id || lang.aliases.some((a) => raw === a || raw.startsWith(`${a} `))) {
      return lang.id;
    }
  }
  if (raw.startsWith('go')) return 'go';
  if (raw.includes('python')) return 'python';
  if (raw.includes('typescript')) return 'typescript';
  if (raw.includes('javascript')) return 'javascript';
  return null;
}

/** Badge text on the opening fence line (preview mode). */
export function notesCodeLangLabel(info: string): string | null {
  const id = normalizeNotesCodeLang(info);
  if (id) return LABELS[id];
  const trimmed = info.trim().toLowerCase();
  return trimmed || null;
}

const notesCodeLanguages = [
  LanguageDescription.of({ name: 'go', alias: ['golang'], support: go() }),
  LanguageDescription.of({ name: 'python', alias: ['py'], support: python() }),
  LanguageDescription.of({ name: 'javascript', alias: ['js'], support: javascript() }),
  LanguageDescription.of({
    name: 'typescript',
    alias: ['ts'],
    support: javascript({ typescript: true }),
  }),
];

/** Markdown + nested parsers for fenced ```lang blocks. */
export const notesMarkdownSupport = markdown({ codeLanguages: notesCodeLanguages });

/** Syntax palette — mirrors apps/web liveEditorTheme, uses Nordly CSS vars. */
const notesCodeHighlightStyle = HighlightStyle.define([
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: 'rgb(var(--editor-syntax-comment))',
    fontStyle: 'italic',
  },
  { tag: [t.string, t.special(t.string), t.character], color: 'rgb(var(--editor-syntax-string))' },
  { tag: [t.number, t.atom, t.literal], color: 'rgb(var(--editor-syntax-number))' },
  { tag: t.bool, color: 'rgb(var(--editor-syntax-number))' },
  { tag: t.null, color: 'rgb(var(--editor-syntax-type))' },
  { tag: t.keyword, color: 'rgb(var(--editor-syntax-keyword))', fontWeight: '600' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: 'rgb(var(--editor-syntax-keyword))', fontWeight: '600' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'rgb(var(--editor-syntax-operator))' },
  { tag: [t.typeName, t.className, t.namespace, t.angleBracket], color: 'rgb(var(--editor-syntax-type))' },
  { tag: t.macroName, color: 'rgb(var(--editor-syntax-type))' },
  { tag: [t.constant(t.variableName), t.constant(t.propertyName)], color: 'rgb(var(--editor-syntax-constant))' },
  {
    tag: [t.definition(t.variableName), t.definition(t.propertyName), t.definition(t.typeName)],
    color: 'rgb(var(--editor-syntax-function))',
    fontWeight: '500',
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName],
    color: 'rgb(var(--editor-syntax-function))',
  },
  { tag: t.propertyName, color: 'rgb(var(--editor-syntax-method))' },
  { tag: [t.standard(t.variableName), t.special(t.variableName), t.self], color: 'rgb(var(--editor-syntax-type))' },
  { tag: t.variableName, color: 'rgb(var(--editor-syntax-variable))' },
  { tag: t.tagName, color: 'rgb(var(--editor-syntax-keyword))' },
  { tag: t.attributeName, color: 'rgb(var(--editor-syntax-string))' },
  { tag: t.regexp, color: 'rgb(var(--editor-syntax-string))' },
  { tag: t.escape, color: 'rgb(var(--editor-syntax-type))' },
]);

export const notesCodeSyntaxHighlighting = syntaxHighlighting(notesCodeHighlightStyle);
