import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@features/spotify/api/spotifyClient', async (original) => ({
  ...await original<typeof import('@features/spotify/api/spotifyClient')>(),
  queueSpotifyVolume: vi.fn(), refreshSpotifyVolume: vi.fn(async () => undefined), setSpotifyVolumeLock: vi.fn(),
}));
import { queueSpotifyVolume, setSpotifyVolumeLock, useSpotifyStore } from '@features/spotify/api/spotifyClient';
import { DockVolume } from '../DockVolume';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
let slider: HTMLInputElement;
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
async function pointer(type: string, buttons: number, target: EventTarget = slider) {
  await act(async () => target.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, buttons, pointerId: 1 })));
}
async function change(value: number) {
  await act(async () => { nativeValue.call(slider, String(value)); slider.dispatchEvent(new Event('input', { bubbles: true })); });
}
beforeEach(async () => {
  vi.clearAllMocks();
  useSpotifyStore.setState({ enabled: true, connected: true, volumePercent: 50, volumeError: null });
  vi.mocked(queueSpotifyVolume).mockImplementation((percent) => useSpotifyStore.setState({ volumePercent: percent }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(DockVolume)));
  slider = container.querySelector('input')!;
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('changes volume only while the mouse is held and ignores movement after release', async () => {
  const capture = vi.fn(); slider.setPointerCapture = capture;
  await pointer('pointerdown', 1); await change(70);
  expect(queueSpotifyVolume).toHaveBeenLastCalledWith(70);
  expect(capture).not.toHaveBeenCalled();
  await pointer('pointerup', 0, window);
  await pointer('pointermove', 0); await change(90);
  expect(queueSpotifyVolume).toHaveBeenCalledTimes(1);
  expect(slider.value).toBe('70');
  expect(container.querySelector('.is-pinned')).toBeNull();
  expect(setSpotifyVolumeLock).toHaveBeenLastCalledWith(false);
});

it.each(['pointercancel', 'lostpointercapture', 'blur'])('ends the drag on %s', async (event) => {
  await pointer('pointerdown', 1);
  await act(async () => {
    if (event === 'blur') window.dispatchEvent(new Event('blur'));
    else slider.dispatchEvent(new PointerEvent(event, { bubbles: true }));
  });
  await change(80);
  expect(queueSpotifyVolume).not.toHaveBeenCalled();
  expect(setSpotifyVolumeLock).toHaveBeenLastCalledWith(false);
  expect(container.querySelector('.is-pinned')).toBeNull();
});

it('recovers if pointerup was missed but a move reports no pressed button', async () => {
  await pointer('pointerdown', 1); await pointer('pointermove', 0); await change(90);
  expect(queueSpotifyVolume).not.toHaveBeenCalled();
  expect(container.querySelector('.is-pinned')).toBeNull();
});

it('preserves keyboard volume control after a mouse click', async () => {
  await pointer('pointerdown', 1); await pointer('pointerup', 0);
  await act(async () => slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
  await change(51);
  expect(queueSpotifyVolume).toHaveBeenCalledWith(51);
});
