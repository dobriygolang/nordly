import { HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'

/** VS Code light — live room default */
export const vscodeLightHighlight = HighlightStyle.define([
  { tag: t.keyword, color: '#0000ff', fontWeight: '500' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#af00db' },
  { tag: [t.string, t.special(t.string), t.character], color: '#a31515' },
  { tag: [t.number, t.atom], color: '#098658' },
  { tag: t.bool, color: '#0000ff' },
  { tag: t.null, color: '#0000ff' },
  { tag: t.literal, color: '#098658' },
  { tag: [t.constant(t.variableName), t.constant(t.propertyName)], color: '#0070c1' },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    color: '#008000',
    fontStyle: 'italic',
  },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: '#795e26' },
  { tag: t.macroName, color: '#af00db' },
  { tag: [t.typeName, t.className, t.namespace, t.angleBracket], color: '#267f99' },
  { tag: t.variableName, color: '#001080' },
  { tag: t.propertyName, color: '#001080' },
  { tag: [t.standard(t.variableName), t.special(t.variableName), t.self], color: '#0000ff' },
  { tag: [t.operator, t.punctuation], color: '#333333' },
  { tag: t.bracket, color: '#333333' },
  { tag: t.tagName, color: '#800000' },
  { tag: t.attributeName, color: '#e50000' },
  { tag: t.regexp, color: '#811f3f' },
  { tag: t.escape, color: '#ff0000' },
])

export function vscodeLightTheme() {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        backgroundColor: '#ffffff',
        color: '#333333',
        fontSize: '14px',
        fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      },
      '.cm-content': { caretColor: '#333333', padding: '20px 24px' },
      '.cm-gutters': { backgroundColor: '#f5f5f5', color: '#6e7681', border: 'none' },
      '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.04)' },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#333333' },
      '.cm-cursor': { borderLeftColor: '#333333', borderLeftWidth: '1.5px' },
      '.cm-selectionBackground, ::selection': { backgroundColor: '#add6ff' },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: '#add6ff' },
    },
    { dark: false },
  )
}

export const vscodeLightEditorExtensions = [
  indentOnInput(),
  syntaxHighlighting(vscodeLightHighlight),
  vscodeLightTheme(),
]
