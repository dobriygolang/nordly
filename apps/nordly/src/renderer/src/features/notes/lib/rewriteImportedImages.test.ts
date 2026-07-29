import { describe, expect, it, vi } from 'vitest';

import { rewriteImportedImages } from './rewriteImportedImages';

describe('rewriteImportedImages', () => {
  it('rewrites embeds and relative images in one pass', async () => {
    const create = vi.fn(async (_noteId: string, fileName: string) => ({
      attachment: { id: `id-${fileName}` },
      markdown: `![${fileName.replace(/\.[^.]+$/, '') || 'image'}](nordly-asset:id-${fileName})`,
    }));
    const load = vi.fn(async (rel: string) => ({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: rel.replace(/^.*\//, ''),
      mime: 'image/png',
    }));

    const body = '# t\n![[a.png]]\nand ![x](./b.png)\n';
    const res = await rewriteImportedImages('note-1', body, load, create);
    expect(res.missing).toEqual([]);
    expect(res.bodyMd).toContain('nordly-asset:id-a.png');
    expect(res.bodyMd).toContain('nordly-asset:id-b.png');
    expect(res.bodyMd).not.toContain('![[a.png]]');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('leaves https intact and warns on http', async () => {
    const create = vi.fn();
    const load = vi.fn();
    const res = await rewriteImportedImages(
      'n',
      '![a](https://cdn.example/x.png) ![b](http://insecure/y.png)',
      load,
      create,
    );
    expect(res.bodyMd).toContain('https://cdn.example/x.png');
    expect(res.bodyMd).toContain('http://insecure/y.png');
    expect(res.warnings.some((w) => w.includes('http_not_allowed'))).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('records missing files without aborting', async () => {
    const create = vi.fn();
    const load = vi.fn(async () => null);
    const res = await rewriteImportedImages('n', '![[gone.png]]', load, create);
    expect(res.bodyMd).toBe('![[gone.png]]');
    expect(res.missing).toEqual(['gone.png']);
  });

  it('uses markdown href from createAttachment (vault-relative paths)', async () => {
    const create = vi.fn(async () => ({
      attachment: { id: 'vault:a.png' },
      markdown: '![a](img/Pasted%20image%202026.png)',
    }));
    const load = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      fileName: 'a.png',
      mime: 'image/png',
    }));
    const res = await rewriteImportedImages('note.md', '![[a.png]]', load, create);
    expect(res.bodyMd).toContain('img/Pasted%20image%202026.png');
    expect(res.bodyMd).not.toContain('nordly-asset:');
    expect(res.bodyMd).not.toContain('![[a.png]]');
  });
});
