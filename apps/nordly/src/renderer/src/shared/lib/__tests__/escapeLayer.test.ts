import { describe, expect, it, vi } from 'vitest';

import {
  dismissTopEscapeLayer,
  escapeLayerDepth,
  pushEscapeLayer,
} from '../escapeLayer';

describe('escape layers', () => {
  it('dismisses a nested picker before its palette', () => {
    const closePalette = vi.fn();
    const closePicker = vi.fn();
    const removePalette = pushEscapeLayer(closePalette);
    const removePicker = pushEscapeLayer(closePicker);

    expect(dismissTopEscapeLayer()).toBe(true);
    expect(closePicker).toHaveBeenCalledTimes(1);
    expect(closePalette).not.toHaveBeenCalled();

    removePicker();
    expect(dismissTopEscapeLayer()).toBe(true);
    expect(closePalette).toHaveBeenCalledTimes(1);

    removePalette();
    expect(escapeLayerDepth()).toBe(0);
  });
});
