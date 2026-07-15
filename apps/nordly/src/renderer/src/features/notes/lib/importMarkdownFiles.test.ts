import { describe, expect, it } from 'vitest';

import {
  isFileDrag,
  isMarkdownFilename,
  listDroppedMarkdownFiles,
  listDroppedMarkdownPaths,
  readMarkdownFile,
  readMarkdownPath,
  titleFromMarkdownFilename,
} from './importMarkdownFiles';

describe('isMarkdownFilename', () => {
  it('accepts .md and .markdown case-insensitively', () => {
    expect(isMarkdownFilename('note.md')).toBe(true);
    expect(isMarkdownFilename('NOTE.MD')).toBe(true);
    expect(isMarkdownFilename('readme.markdown')).toBe(true);
    expect(isMarkdownFilename('README.MARKDOWN')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(isMarkdownFilename('note.txt')).toBe(false);
    expect(isMarkdownFilename('note.mdx')).toBe(false);
    expect(isMarkdownFilename('note')).toBe(false);
  });
});

describe('titleFromMarkdownFilename', () => {
  it('strips extension and path', () => {
    expect(titleFromMarkdownFilename('My Note.md')).toBe('My Note');
    expect(titleFromMarkdownFilename('/tmp/ideas.markdown')).toBe('ideas');
    expect(titleFromMarkdownFilename('C:\\\\docs\\\\plan.MD')).toBe('plan');
  });

  it('falls back to Untitled when empty after strip', () => {
    expect(titleFromMarkdownFilename('.md')).toBe('Untitled');
    expect(titleFromMarkdownFilename('  .markdown')).toBe('Untitled');
  });
});

describe('readMarkdownFile', () => {
  it('reads title and body', async () => {
    const file = new File(['# Hello\n'], 'hello.md', { type: 'text/markdown' });
    await expect(readMarkdownFile(file)).resolves.toEqual({
      title: 'hello',
      bodyMd: '# Hello\n',
    });
  });

  it('rejects non-markdown', async () => {
    const file = new File(['x'], 'hello.txt', { type: 'text/plain' });
    await expect(readMarkdownFile(file)).rejects.toThrow(/Not a markdown file/);
  });
});

describe('isFileDrag', () => {
  it('detects Files type', () => {
    expect(isFileDrag({ types: ['Files'] } as unknown as DataTransfer)).toBe(true);
    expect(isFileDrag({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });
});

describe('listDroppedMarkdownFiles', () => {
  it('filters to markdown only', () => {
    const md = new File(['a'], 'a.md');
    const txt = new File(['b'], 'b.txt');
    expect(listDroppedMarkdownFiles([md, txt])).toEqual([md]);
    expect(listDroppedMarkdownFiles(null)).toEqual([]);
  });
});

describe('listDroppedMarkdownPaths / readMarkdownPath', () => {
  it('filters paths by markdown extension', () => {
    expect(listDroppedMarkdownPaths(['/tmp/a.md', '/tmp/b.txt', '/tmp/c.markdown'])).toEqual([
      '/tmp/a.md',
      '/tmp/c.markdown',
    ]);
  });

  it('reads via injected reader', async () => {
    await expect(
      readMarkdownPath('/Users/me/Notes/Hello.md', async () => '# Hi\n'),
    ).resolves.toEqual({ title: 'Hello', bodyMd: '# Hi\n' });
  });
});
