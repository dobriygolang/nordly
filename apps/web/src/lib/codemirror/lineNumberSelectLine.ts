import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

/**
 * Click a line number to select that whole line (incl. trailing newline when present).
 * Leaves mid-line caret placement in the content area unchanged.
 */
export function lineNumberSelectLine(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (event.button !== 0) return false
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
      const target = event.target as HTMLElement | null
      if (!target?.closest('.cm-lineNumbers')) return false

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return false

      const line = view.state.doc.lineAt(pos)
      const to =
        line.number < view.state.doc.lines ? line.to + 1 : line.to

      event.preventDefault()
      view.dispatch({
        selection: EditorSelection.range(line.from, to),
        scrollIntoView: true,
        userEvent: 'select',
      })
      view.focus()
      return true
    },
  })
}
