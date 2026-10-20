export interface LocalFile {
  path: string;
  hash: string;
}

export interface IndexEntry {
  path: string;
  serverId: string;
  hash: string;
  remoteUpdatedAt: string;
}

/** `hash` is the decrypted body. First merge compares it with the local file. */
export interface RemoteNote {
  serverId: string;
  path: string;
  updatedAt: string;
  hash: string;
}

export type VaultReconcileAction =
  | { op: 'push_put'; path: string }
  | { op: 'push_delete'; path: string; serverId: string }
  | { op: 'pull_write'; path: string; serverId: string }
  | { op: 'pull_trash'; path: string }
  | { op: 'conflict_copy'; path: string; serverId: string }
  | { op: 'index_only'; entry: IndexEntry }
  | { op: 'index_drop'; path: string };

export type VaultReconcilePlan =
  | { ok: true; actions: VaultReconcileAction[] }
  | { ok: false; reason: 'local_root_empty_but_index_full' };

/** NTFS treats these as one file. Merging them would overwrite one of the notes. */
function assertDistinctCase(paths: Iterable<string>): void {
  const seen = new Map<string, string>();
  for (const path of paths) {
    const folded = path.toLowerCase();
    const previous = seen.get(folded);
    if (previous !== undefined && previous !== path) {
      throw new Error('vault reconcile: paths differ only by case');
    }
    seen.set(folded, path);
  }
}

function byPath<T extends { path: string }>(rows: T[], label: string): Map<string, T> {
  const out = new Map<string, T>();
  for (const row of rows) {
    if (out.has(row.path)) {
      throw new Error(`vault reconcile: duplicate ${label} path ${row.path}`);
    }
    out.set(row.path, row);
  }
  return out;
}

export function planVaultReconcile(
  local: LocalFile[],
  index: IndexEntry[],
  remote: RemoteNote[],
): VaultReconcilePlan {
  if (local.length === 0 && index.length > 0) {
    return { ok: false, reason: 'local_root_empty_but_index_full' };
  }
  assertDistinctCase([
    ...local.map((row) => row.path),
    ...index.map((row) => row.path),
    ...remote.map((row) => row.path),
  ]);

  const localByPath = byPath(local, 'local');
  const indexByPath = byPath(index, 'index');
  const remoteByPath = byPath(remote, 'remote');
  const paths = [...new Set([...localByPath.keys(), ...indexByPath.keys(), ...remoteByPath.keys()])].sort();
  const actions: VaultReconcileAction[] = [];

  for (const path of paths) {
    const file = localByPath.get(path);
    const entry = indexByPath.get(path);
    const note = remoteByPath.get(path);
    actions.push(...actionsFor(path, file, entry, note));
  }
  return { ok: true, actions };
}

function actionsFor(
  path: string,
  file: LocalFile | undefined,
  entry: IndexEntry | undefined,
  note: RemoteNote | undefined,
): VaultReconcileAction[] {
  if (file && entry && note) {
    const localChanged = file.hash !== entry.hash;
    const remoteChanged = note.updatedAt !== entry.remoteUpdatedAt;
    if (!localChanged && !remoteChanged) return [];
    if (localChanged && !remoteChanged) return [{ op: 'push_put', path }];
    if (!localChanged && remoteChanged) return [{ op: 'pull_write', path, serverId: note.serverId }];
    return [{ op: 'conflict_copy', path, serverId: note.serverId }];
  }
  if (file && !entry && !note) return [{ op: 'push_put', path }];
  if (!file && !entry && note) return [{ op: 'pull_write', path, serverId: note.serverId }];
  if (file && !entry && note) {
    if (file.hash === note.hash) {
      return [{
        op: 'index_only',
        entry: {
          path,
          serverId: note.serverId,
          hash: file.hash,
          remoteUpdatedAt: note.updatedAt,
        },
      }];
    }
    return [{ op: 'conflict_copy', path, serverId: note.serverId }];
  }
  if (!file && entry && note) {
    if (note.updatedAt === entry.remoteUpdatedAt) {
      return [{ op: 'push_delete', path, serverId: note.serverId }];
    }
    return [{ op: 'pull_write', path, serverId: note.serverId }];
  }
  if (file && entry && !note) {
    if (file.hash === entry.hash) return [{ op: 'pull_trash', path }];
    return [{ op: 'push_put', path }];
  }
  if (!file && entry && !note) return [{ op: 'index_drop', path }];
  throw new Error('vault reconcile: path is in no snapshot');
}
