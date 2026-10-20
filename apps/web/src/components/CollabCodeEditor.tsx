import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import { cmLanguageExt } from '@/lib/codemirror/langExtension'
import { editorAssistExtensions } from '@/lib/codemirror/editorAssist'
import { collabUserColors } from '@/lib/codemirror/collabColors'
import type { CodeRunBroadcast } from '@/lib/ws/collabEditor'
import type { LiveCollabSession } from '@/lib/ws/useLiveCollabSession'
import { editorExtensionsForTheme } from '@/lib/codemirror/liveEditorTheme'
import { lineNumberSelectLine } from '@/lib/codemirror/lineNumberSelectLine'
import type { LiveRoomTheme } from '@/lib/live/roomTheme'

function applyLocalCollabChrome(view: EditorView, seed: string): void {
  const colors = collabUserColors(seed)
  view.dom.style.setProperty('--cm-local-selection', colors.colorLight)
  view.dom.style.setProperty('--cm-local-caret', colors.color)
}

export type CollabCodeEditorHandle = {
  getCode: () => string
  setCode: (code: string) => void
  broadcastCodeRun: (payload: CodeRunBroadcast) => void
}

type Props = {
  session: LiveCollabSession
  language: string
  theme?: LiveRoomTheme
  autocompleteEnabled?: boolean
  /** Stable presence id (JWT subject). */
  userId: string
  fontSize?: number
  onRun?: () => void
  onFormat?: () => void
}

export const CollabCodeEditor = forwardRef<CollabCodeEditorHandle, Props>(function CollabCodeEditor(
  {
    session,
    language,
    theme = 'light',
    autocompleteEnabled = true,
    userId,
    fontSize = 14,
    onRun,
    onFormat,
  },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const themeCompartment = useRef(new Compartment())
  const assistCompartment = useRef(new Compartment())
  const fontSizeCompartment = useRef(new Compartment())
  const onRunRef = useRef(onRun)
  const onFormatRef = useRef(onFormat)
  onRunRef.current = onRun
  onFormatRef.current = onFormat

  if (!userId) throw new Error('CollabCodeEditor: userId required')

  useImperativeHandle(ref, () => ({
    getCode: () => session.ydoc.getText('code').toString(),
    setCode: (code: string) => {
      const ytext = session.ydoc.getText('code')
      session.ydoc.transact(() => {
        ytext.delete(0, ytext.length)
        ytext.insert(0, code)
      })
    },
    broadcastCodeRun: (payload) => {
      const sent = session.send({ kind: 'code_run', data: payload })
      if (!sent) console.warn('[CollabCodeEditor] code_run was not sent')
    },
  }), [session])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const ytext = session.ydoc.getText('code')
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        lineNumberSelectLine(),
        keymap.of([indentWithTab, ...defaultKeymap, ...yUndoManagerKeymap]),
        cmLanguageExt(language),
        assistCompartment.current.of(editorAssistExtensions({ autocomplete: autocompleteEnabled })),
        themeCompartment.current.of(editorExtensionsForTheme(theme)),
        fontSizeCompartment.current.of(
          EditorView.theme({
            '&': { fontSize: `${fontSize}px` },
            '.cm-content': { fontSize: `${fontSize}px` },
            '.cm-gutters': { fontSize: `${fontSize}px` },
          }),
        ),
        yCollab(ytext, session.awareness),
        EditorView.editable.of(true),
      ],
    })
    const view = new EditorView({ state, parent: mount })
    viewRef.current = view
    applyLocalCollabChrome(view, userId)

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Theme, font, and autocomplete reconfigure below. Recreating the view drops the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, session.awareness, session.ydoc, userId])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: themeCompartment.current.reconfigure(editorExtensionsForTheme(theme)),
    })
  }, [theme])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: assistCompartment.current.reconfigure(
        editorAssistExtensions({ autocomplete: autocompleteEnabled }),
      ),
    })
  }, [autocompleteEnabled])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: fontSizeCompartment.current.reconfigure(
        EditorView.theme({
          '&': { fontSize: `${fontSize}px` },
          '.cm-content': { fontSize: `${fontSize}px` },
          '.cm-gutters': { fontSize: `${fontSize}px` },
        }),
      ),
    })
  }, [fontSize])

  useEffect(() => {
    const view = viewRef.current
    if (view) applyLocalCollabChrome(view, userId)
  }, [userId])

  useEffect(() => {
    if (!onRun && !onFormat) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onRunRef.current?.()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        onFormatRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onRun, onFormat])

  return <div ref={mountRef} className="absolute inset-0 always-show-cursor-labels" />
})

export { wsStatusColor } from '@/lib/live/wsStatusColor'
