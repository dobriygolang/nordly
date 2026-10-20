import type { Awareness } from 'y-protocols/awareness';

/** Stable cursor color. Hex only — the same seed always picks the same hue. */
export function collabUserColors(seed: string): { color: string; colorLight: string } {
  const hue = hashString(seed) % 360;
  const color = hslToHex(hue, 82, 58);
  return { color, colorLight: `${color}40` };
}

export type LivePointer = {
  x: number;
  y: number;
  tool: 'pointer' | 'laser';
  button: 'up' | 'down';
};

export type LiveCollaborator = {
  clientId: number;
  username: string;
  color: string;
  pointer?: LivePointer;
};

type AwarenessUser = {
  name?: unknown;
  color?: unknown;
  userId?: unknown;
};

export function setLocalCursor(awareness: Awareness, pointer: LivePointer | null): void {
  awareness.setLocalStateField('cursor', pointer);
}

/** Remote peers only. A peer without a name or color is skipped. */
export function collaboratorsFromAwareness(awareness: Awareness): LiveCollaborator[] {
  const selfId = awareness.clientID;
  const peers: LiveCollaborator[] = [];
  awareness.getStates().forEach((state, clientId) => {
    if (clientId === selfId) return;
    const user = state.user as AwarenessUser | undefined;
    if (typeof user?.name !== 'string' || !user.name) return;
    if (typeof user.color !== 'string' || !user.color) return;
    const pointer = readPointer(state.cursor);
    peers.push({
      clientId,
      username: user.name,
      color: user.color,
      ...(pointer ? { pointer } : {}),
    });
  });
  peers.sort((a, b) => a.username.localeCompare(b.username) || a.clientId - b.clientId);
  return peers;
}

function readPointer(value: unknown): LivePointer | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { x?: unknown; y?: unknown; tool?: unknown; button?: unknown };
  if (typeof row.x !== 'number' || typeof row.y !== 'number') return null;
  if (!Number.isFinite(row.x) || !Number.isFinite(row.y)) return null;
  const tool = row.tool === 'laser' ? 'laser' : 'pointer';
  const button = row.button === 'down' ? 'down' : 'up';
  return { x: row.x, y: row.y, tool, button };
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const sat = saturation / 100;
  const light = lightness / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
