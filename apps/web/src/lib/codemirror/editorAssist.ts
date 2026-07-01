import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { liveAutocompleteTheme } from '@/lib/codemirror/liveEditorTheme'

const autocompleteConfig = autocompletion({
  activateOnTyping: true,
  activateOnTypingDelay: 80,
  maxRenderedOptions: 16,
  icons: false,
  defaultKeymap: true,
  closeOnBlur: true,
  updateSyncTime: 30,
})

/** Autocomplete, bracket closing, and completion keybindings for code editors. */
export function editorAssistExtensions(options?: {
  autocomplete?: boolean
  /** @deprecated styling follows site CSS vars via html.light / html.dark */
  theme?: 'light' | 'dark'
}): Extension[] {
  const autocomplete = options?.autocomplete ?? true
  const out: Extension[] = [
    closeBrackets(),
    keymap.of([...closeBracketsKeymap, ...completionKeymap]),
    liveAutocompleteTheme,
  ]
  if (autocomplete) {
    out.unshift(autocompleteConfig)
  }
  return out
}
