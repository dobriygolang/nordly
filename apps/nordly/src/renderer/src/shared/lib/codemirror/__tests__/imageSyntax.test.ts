import { describe, expect, it } from 'vitest';

import { findMarkdownImages } from '../imageSyntax';

describe('findMarkdownImages', () => {
  it('reads a plain destination', () => {
    expect(findMarkdownImages('see ![alt](img/a.png) here')).toEqual([
      { from: 4, to: 21, alt: 'alt', href: 'img/a.png', width: null },
    ]);
  });

  it('keeps unencoded spaces and percent-encoding', () => {
    expect(findMarkdownImages('![](img/my pic.png)')).toEqual([
      { from: 0, to: 19, alt: '', href: 'img/my pic.png', width: null },
    ]);
    expect(findMarkdownImages('![](img/my%20pic.png)')[0]?.href).toBe('img/my%20pic.png');
  });

  it('reads an angle-bracket destination', () => {
    expect(findMarkdownImages('![](<img/my pic.png>)')).toEqual([
      { from: 0, to: 21, alt: '', href: 'img/my pic.png', width: null },
    ]);
  });

  it('drops an optional title and returns every image on the line', () => {
    const found = findMarkdownImages('![a](one.png "t") ![b](two.png)');
    expect(found.map((image) => image.href)).toEqual(['one.png', 'two.png']);
    expect(found[0]?.width).toBeNull();
  });

  it('reads a pixel width from the alt text', () => {
    expect(findMarkdownImages('![diagram|300](img/a.png)')[0]).toMatchObject({
      alt: 'diagram',
      href: 'img/a.png',
      width: 300,
    });
  });
});
