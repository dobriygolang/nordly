import { describe, expect, it } from 'vitest';

import {
  applyCaptureBody,
  formatCaptureLine,
  phraseProblem,
  type CaptureSession,
} from '@nordly-translate/captureBody';

describe('capture lines', () => {
  it('rejects numbers, colons, and scripts outside ru/en', () => {
    expect(phraseProblem('10')).toBe('no-letters');
    expect(phraseProblem('hello :: there')).toBe('bad-phrase');
    expect(phraseProblem('カタカナ')).toBe('unsupported-script');
    expect(phraseProblem('ubiquitous')).toBeNull();
    expect(phraseProblem('привет')).toBeNull();
  });

  it('appends once, replaces the same capture, and skips a repeated word', () => {
    const sessions = new Map<string, CaptureSession>();
    const first = applyCaptureBody('', 'note', 'c1', formatCaptureLine('Hello', 'привет'), sessions);
    expect(first).toEqual({ body: 'hello ::: привет', wrote: true, duplicate: false });

    const edited = applyCaptureBody(
      first.body,
      'note',
      'c1',
      formatCaptureLine('Hello', 'здравствуй'),
      sessions,
    );
    expect(edited.body).toBe('hello ::: здравствуй');
    expect(edited.wrote).toBe(true);

    const again = applyCaptureBody(
      edited.body,
      'note',
      'c2',
      formatCaptureLine('hello', 'ещё'),
      sessions,
    );
    expect(again.wrote).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(again.body).toBe(edited.body);
  });

  it('keeps two captures in order', () => {
    const sessions = new Map<string, CaptureSession>();
    const first = applyCaptureBody('old', 'note', 'c1', formatCaptureLine('one', 'один'), sessions);
    const second = applyCaptureBody(first.body, 'note', 'c2', formatCaptureLine('two', 'два'), sessions);
    expect(second.body).toBe('old\none ::: один\ntwo ::: два');
  });

  it('writes :: when asked and still dedupes by front', () => {
    const sessions = new Map<string, CaptureSession>();
    const first = applyCaptureBody('', 'note', 'c1', formatCaptureLine('Hello', 'привет', '::'), sessions);
    expect(first).toEqual({ body: 'hello :: привет', wrote: true, duplicate: false });
    const again = applyCaptureBody(
      first.body,
      'note',
      'c2',
      formatCaptureLine('hello', 'ещё', '::'),
      sessions,
    );
    expect(again.duplicate).toBe(true);
  });
});
