import { HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'
import { brand } from '@/lib/brand/tokens'

/** Syntax palette — reads site CSS vars (html.light / html.dark). */
const liveHighlight = HighlightStyle.define([
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
  { tag: [t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: 'rgb(var(--editor-syntax-keyword))', fontWeight: '600' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'rgb(var(--editor-syntax-operator))' },
  { tag: [t.typeName, t.className, t.namespace, t.angleBracket], color: 'rgb(var(--editor-syntax-type))' },
  { tag: t.definition(t.typeName), color: 'rgb(var(--editor-syntax-type))', fontWeight: '500' },
  { tag: t.macroName, color: 'rgb(var(--editor-syntax-type))' },
  { tag: [t.constant(t.variableName), t.constant(t.propertyName)], color: 'rgb(var(--editor-syntax-constant))' },
  {
    tag: [t.definition(t.variableName), t.definition(t.propertyName)],
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
])

/** Editor chrome — site surface / border tokens. */
function liveEditorTheme() {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: 'rgb(var(--color-surface-1))',
        color: 'rgb(var(--color-text-primary))',
        fontSize: '14px',
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      },
      '.cm-content': {
        caretColor: 'rgb(var(--color-text-primary))',
        padding: '20px 24px',
      },
      '.cm-gutters': {
        backgroundColor: 'rgb(var(--color-bg))',
        color: 'rgb(var(--color-text-muted))',
        border: 'none',
      },
      '.cm-activeLine': { backgroundColor: 'rgb(var(--color-surface-2))' },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
        color: 'rgb(var(--color-text-secondary))',
      },
      '.cm-cursor': {
        borderLeftColor: 'var(--cm-local-caret, rgb(var(--color-text-primary)))',
        borderLeftWidth: '1.5px',
      },
      // Prefer collab identity tint when set on the editor (see CollabCodeEditor).
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--cm-local-selection, rgb(var(--editor-selection)))',
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--cm-local-selection, rgb(var(--editor-selection)))',
      },
      '.cm-lineNumbers .cm-gutterElement': { padding: '0 12px 0 16px' },
    },
    { dark: false },
  )
}

export const liveEditorExtensions = [
  indentOnInput(),
  syntaxHighlighting(liveHighlight),
  liveEditorTheme(),
]

/** @deprecated theme arg ignored — editor follows html.light / html.dark CSS vars */
export function editorExtensionsForTheme(_theme?: 'light' | 'dark') {
  return liveEditorExtensions
}

/** Autocomplete popover — same tokens as room settings / top bar. */
export const liveAutocompleteTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    backgroundColor: 'rgb(var(--color-surface-1))',
    border: '1px solid rgb(var(--color-border))',
    borderRadius: '12px',
    boxShadow: brand.cardShadow,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    fontSize: '13px',
    color: 'rgb(var(--color-text-primary))',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: 'inherit',
    maxHeight: '12rem',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    padding: '6px 12px',
    lineHeight: '1.4',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'rgb(var(--color-surface-2))',
    color: 'rgb(var(--color-text-primary))',
  },
  '.cm-completionLabel': {
    fontFamily: 'inherit',
  },
  '.cm-completionDetail': {
    color: 'rgb(var(--color-text-muted))',
    fontStyle: 'normal',
    marginLeft: '8px',
    fontFamily: 'inherit',
  },
  '.cm-completionInfo': {
    backgroundColor: 'rgb(var(--color-surface-2))',
    border: '1px solid rgb(var(--color-border))',
    borderRadius: '8px',
    padding: '8px 10px',
    maxWidth: '320px',
    color: 'rgb(var(--color-text-secondary))',
    fontSize: '12px',
    fontFamily: 'inherit',
    boxShadow: brand.cardShadow,
  },
  '.cm-completionIcon': {
    display: 'none',
  },
})
