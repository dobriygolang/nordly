import { describe, expect, it } from 'vitest';

import { applyPublishImageRewrites, findLocalPublishImages } from '../publishImages';

describe('findLocalPublishImages', () => {
  it('collects markdown and embed images and skips fences, https, and nordly-asset', () => {
    const body = [
      'see ![diagram](img/a.png)',
      '![[shot.png|300]]',
      '![remote](https://example.com/a.png)',
      '![asset](nordly-asset:11111111-1111-4111-8111-111111111111)',
      '```',
      '![hidden](img/secret.png)',
      '```',
    ].join('\n');
    const spans = findLocalPublishImages(body);
    expect(spans.map((span) => span.href)).toEqual(['img/a.png', 'shot.png']);
    expect(spans[1]?.width).toBe(300);
  });

  it('ignores images inside a longer fence and inside inline code', () => {
    const body = [
      '````',
      '```',
      '![hidden](img/secret.png)',
      '````',
      'see `![skip](img/code.png)` ![shown](img/a.png)',
    ].join('\n');
    expect(findLocalPublishImages(body).map((span) => span.href)).toEqual(['img/a.png']);
  });
});

describe('applyPublishImageRewrites', () => {
  it('rewrites each local image to a nordly-asset link and keeps width', () => {
    const body = '![diagram](img/a.png)\n![[shot.png|300]]';
    const spans = findLocalPublishImages(body);
    const next = applyPublishImageRewrites(
      body,
      spans,
      new Map([
        ['img/a.png', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
        ['shot.png', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
      ]),
    );
    expect(next).toBe(
      '![diagram](nordly-asset:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)\n![shot.png|300](nordly-asset:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb)',
    );
  });
});
