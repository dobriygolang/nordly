import { describe, expect, it } from 'vitest';

import { splitQuickCaptureText } from './quickCaptureNote';

describe('splitQuickCaptureText', () => {
  it('returns null for empty input', () => {
    expect(splitQuickCaptureText('')).toBeNull();
    expect(splitQuickCaptureText('   \n  ')).toBeNull();
  });

  it('uses single line as title', () => {
    expect(splitQuickCaptureText('Quick thought')).toEqual({
      title: 'Quick thought',
      bodyMd: '',
    });
  });

  it('splits first line to title and rest to body', () => {
    expect(splitQuickCaptureText('Title line\nBody line one\nBody line two')).toEqual({
      title: 'Title line',
      bodyMd: 'Body line one\nBody line two',
    });
  });

  it('falls back to Untitled when first line is blank', () => {
    expect(splitQuickCaptureText('\nOnly body')).toEqual({
      title: 'Untitled',
      bodyMd: 'Only body',
    });
  });
});
