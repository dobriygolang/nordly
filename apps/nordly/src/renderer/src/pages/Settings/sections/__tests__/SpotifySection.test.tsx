import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@features/spotify/lib/pkce', () => ({ isSpotifyConfigured: () => true }));
vi.mock('@features/spotify/api/spotifyClient', async (original) => ({
  ...await original<typeof import('@features/spotify/api/spotifyClient')>(),
  hydrateSpotify: vi.fn(), watchSpotifyPlayback: vi.fn(() => vi.fn()), disconnectSpotify: vi.fn(),
}));
import { SpotifySection } from '../SpotifySection';
import { useSpotifyStore, disconnectSpotify } from '@features/spotify/api/spotifyClient';
import { readSettings } from '@shared/model/settings';
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('pauses and resumes a connected account through the persistent switch without disconnecting', async () => {
  localStorage.clear();
  useSpotifyStore.setState({ enabled: true, connected: true, hydrated: true });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(createElement(SpotifySection)));
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle.click());
  expect(readSettings().spotifyEnabled).toBe(false);
  expect(useSpotifyStore.getState().connected).toBe(true);
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  expect(disconnectSpotify).not.toHaveBeenCalled();
  await act(async () => toggle.click());
  expect(readSettings().spotifyEnabled).toBe(true);
  expect(useSpotifyStore.getState().connected).toBe(true);
  await act(async () => root.unmount()); container.remove();
});
