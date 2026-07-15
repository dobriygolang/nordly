import { describe, expect, it, beforeEach } from 'vitest';

import {
  NOTES_ZOOM_DEFAULT,
  clampNotesEditorZoom,
  loadNotesEditorZoom,
  saveNotesEditorZoom,
  stepNotesEditorZoom,
} from './notesEditorZoom';

describe('clampNotesEditorZoom', () => {
  it('clamps and snaps to 0.1 steps', () => {
    expect(clampNotesEditorZoom(0.5)).toBe(0.7);
    expect(clampNotesEditorZoom(2)).toBe(1.6);
    expect(clampNotesEditorZoom(1.04)).toBe(1);
    expect(clampNotesEditorZoom(1.06)).toBe(1.1);
    expect(clampNotesEditorZoom(Number.NaN)).toBe(NOTES_ZOOM_DEFAULT);
  });
});

describe('stepNotesEditorZoom', () => {
  it('steps in and out', () => {
    expect(stepNotesEditorZoom(1, 1)).toBe(1.1);
    expect(stepNotesEditorZoom(1, -1)).toBe(0.9);
    expect(stepNotesEditorZoom(0.7, -1)).toBe(0.7);
    expect(stepNotesEditorZoom(1.6, 1)).toBe(1.6);
  });
});

describe('load/saveNotesEditorZoom', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults when empty', () => {
    expect(loadNotesEditorZoom()).toBe(NOTES_ZOOM_DEFAULT);
  });

  it('round-trips', () => {
    saveNotesEditorZoom(1.3);
    expect(loadNotesEditorZoom()).toBe(1.3);
  });
});
