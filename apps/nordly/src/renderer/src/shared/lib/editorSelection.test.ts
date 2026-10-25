import { beforeEach, describe, expect, it } from 'vitest';
import { loadEditorSelection, saveEditorSelection } from './editorSelection';

beforeEach(() => localStorage.clear());

describe('saved editor selection', () => {
  it('restores a selection independently for each note', () => {
    saveEditorSelection('note-a', { anchor: 12, head: 5 });
    saveEditorSelection('note-b', { anchor: 2, head: 2 });
    expect(loadEditorSelection('note-a', 20)).toEqual({ anchor: 12, head: 5 });
    expect(loadEditorSelection('note-b', 20)).toEqual({ anchor: 2, head: 2 });
  });

  it('clamps the saved cursor if the note was shortened externally', () => {
    saveEditorSelection('note', { anchor: 100, head: 5 });
    expect(loadEditorSelection('note', 8)).toEqual({ anchor: 8, head: 5 });
    expect(loadEditorSelection('note', 0)).toEqual({ anchor: 0, head: 0 });
  });

  it('does not invent a saved position for a new note', () => {
    expect(loadEditorSelection('new-note', 20)).toBeUndefined();
  });
});
