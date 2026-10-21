import type { Awareness } from 'y-protocols/awareness'

export type LiveDraftPeer = {
  clientId: number
  elements: unknown[]
}

/** True while the local user is mid-create / mid-edit / mid-drag. */
export function isBoardGesturing(
  appState: Record<string, unknown> | null | undefined,
  pointerButton: 'up' | 'down' | null | undefined,
): boolean {
  if (pointerButton === 'down') return true
  if (!appState) return false
  if (appState.newElement) return true
  if (appState.editingElement) return true
  if (appState.resizingElement) return true
  if (appState.isResizing === true || appState.isRotating === true) return true
  const selectedLinear = appState.selectedLinearElement
  if (
    selectedLinear &&
    typeof selectedLinear === 'object' &&
    !Array.isArray(selectedLinear) &&
    (selectedLinear as { isEditing?: unknown }).isEditing === true
  ) {
    return true
  }
  return false
}

export function elementId(el: unknown): string | null {
  if (!el || typeof el !== 'object') return null
  const id = (el as { id?: unknown }).id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** id → JSON snapshot of the last Yjs-committed element. */
export function indexElementsById(elements: readonly unknown[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const el of elements) {
    const id = elementId(el)
    if (!id) continue
    map.set(id, JSON.stringify(el))
  }
  return map
}

/** Elements that differ from the last committed snapshot (new or mutated). */
export function collectDraftElements(
  elements: readonly unknown[],
  committedJsonById: ReadonlyMap<string, string>,
): unknown[] {
  const drafts: unknown[] = []
  for (const el of elements) {
    const id = elementId(el)
    if (!id) continue
    const serialized = JSON.stringify(el)
    if (committedJsonById.get(id) !== serialized) drafts.push(el)
  }
  return drafts
}

export function draftElementIds(elements: readonly unknown[]): Set<string> {
  const ids = new Set<string>()
  for (const el of elements) {
    const id = elementId(el)
    if (id) ids.add(id)
  }
  return ids
}

/** Element ids Excalidraw currently treats as the active edit (create/resize/selection). */
export function inProgressElementIds(appState: Record<string, unknown>): Set<string> {
  const ids = new Set<string>()
  const add = (value: unknown) => {
    const id = elementId(value)
    if (id) ids.add(id)
  }
  add(appState.newElement)
  add(appState.editingElement)
  add(appState.resizingElement)
  const selected = appState.selectedElementIds
  if (selected && typeof selected === 'object' && !Array.isArray(selected)) {
    for (const [id, on] of Object.entries(selected as Record<string, unknown>)) {
      if (on && id) ids.add(id)
    }
  }
  return ids
}

export function setLocalDraft(awareness: Awareness, elements: readonly unknown[] | null): void {
  awareness.setLocalStateField('draft', elements && elements.length > 0 ? { elements } : null)
}

/** Remote peers only. Invalid or empty drafts are skipped. */
export function draftsFromAwareness(awareness: Awareness): LiveDraftPeer[] {
  const selfId = awareness.clientID
  const peers: LiveDraftPeer[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfId) return
    const elements = readDraftElements(state.draft)
    if (!elements || elements.length === 0) return
    peers.push({ clientId, elements })
  })
  peers.sort((a, b) => a.clientId - b.clientId)
  return peers
}

/** Cheap fingerprint — Excalidraw bumps `versionNonce` on every mutate. */
export function draftSignature(drafts: readonly LiveDraftPeer[]): string {
  return drafts
    .map((peer) => {
      const parts = peer.elements.map((el) => {
        if (!el || typeof el !== 'object') return '?'
        const row = el as { id?: unknown; versionNonce?: unknown; version?: unknown }
        return `${String(row.id ?? '')}:${String(row.versionNonce ?? row.version ?? '')}`
      })
      return `${peer.clientId}:${parts.join(',')}`
    })
    .join('|')
}

/** Committed Yjs scene + remote awareness drafts (draft wins per id). */
export function mergeCommittedWithRemoteDrafts(
  committed: readonly unknown[],
  drafts: readonly LiveDraftPeer[],
): unknown[] {
  const byId = new Map<string, unknown>()
  const order: string[] = []
  for (const el of committed) {
    const id = elementId(el)
    if (!id) continue
    byId.set(id, el)
    order.push(id)
  }
  for (const peer of drafts) {
    for (const el of peer.elements) {
      const id = elementId(el)
      if (!id) continue
      if (!byId.has(id)) order.push(id)
      byId.set(id, el)
    }
  }
  return order.map((id) => byId.get(id)!)
}

/**
 * When applying a remote merged scene during a local gesture, keep local draft
 * elements so an in-progress stroke is not clobbered.
 */
export function preserveLocalDrafts(
  remoteMerged: readonly unknown[],
  localElements: readonly unknown[],
  localDraftIds: ReadonlySet<string>,
): unknown[] {
  if (localDraftIds.size === 0) return remoteMerged.slice()
  const byId = new Map<string, unknown>()
  const order: string[] = []
  for (const el of remoteMerged) {
    const id = elementId(el)
    if (!id) continue
    byId.set(id, el)
    order.push(id)
  }
  for (const el of localElements) {
    const id = elementId(el)
    if (!id || !localDraftIds.has(id)) continue
    if (!byId.has(id)) order.push(id)
    byId.set(id, el)
  }
  return order.map((id) => byId.get(id)!)
}

function readDraftElements(value: unknown): unknown[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const elements = (value as { elements?: unknown }).elements
  if (!Array.isArray(elements) || elements.length === 0) return null
  return elements
}
