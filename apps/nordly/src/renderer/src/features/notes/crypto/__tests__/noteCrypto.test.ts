import { describe, expect, it } from 'vitest';

import { decodeNoteEnvelope, encodeNoteEnvelope } from '../noteCrypto';

describe('note envelope', () => {
  it('keeps path and body together so a swapped server title cannot retarget the file', () => {
    const raw = encodeNoteEnvelope('proj/A.md', 'body-a');
    expect(decodeNoteEnvelope(raw)).toEqual({ path: 'proj/A.md', body: 'body-a' });
  });

  it('rejects a version other than 2', () => {
    expect(() => decodeNoteEnvelope(JSON.stringify({ v: 1, path: 'a.md', body: 'x' }))).toThrow(
      /version is not supported/,
    );
  });

  it('rejects a payload that is not the envelope', () => {
    expect(() => decodeNoteEnvelope('not-json')).toThrow(/damaged/);
    expect(() => decodeNoteEnvelope(JSON.stringify({ v: 2, body: 'x' }))).toThrow(/missing path/);
  });
});
