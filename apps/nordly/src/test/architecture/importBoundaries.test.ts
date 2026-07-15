import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER_ROOT = resolve(process.cwd(), 'src/renderer/src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const IMPORT_PATTERN = /(?:from\s+|import\s*(?:\(\s*)?)['"]([^'"]+)['"]/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  });
}

function importsOf(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(IMPORT_PATTERN)].map((match) => match[1]);
}

describe('renderer import boundaries', () => {
  it('keeps shared and features independent from composition layers', () => {
    const sharedViolations = sourceFiles(resolve(RENDERER_ROOT, 'shared')).flatMap((path) => {
      const source = relative(RENDERER_ROOT, path);
      return importsOf(path)
        .filter((specifier) => /^@(?:app|pages|widgets)\//.test(specifier))
        .map((specifier) => `${source}:${specifier}`);
    });
    const featureViolations = sourceFiles(resolve(RENDERER_ROOT, 'features')).flatMap((path) => {
      const source = relative(RENDERER_ROOT, path);
      return importsOf(path)
        .filter((specifier) => /^@(?:app|pages|widgets)\//.test(specifier))
        .map((specifier) => `${source}:${specifier}`);
    });

    expect([...sharedViolations, ...featureViolations]).toEqual([]);
  });

  it('keeps pages and widgets out of feature persistence and transport internals', () => {
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'pages'))
      .concat(sourceFiles(resolve(RENDERER_ROOT, 'widgets')))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) => /^@features\/[^/]+\/(?:repository|remote|sync)\//.test(specifier))
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });

  it('keeps task and planning calendar imports on the public API', () => {
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'features/tasks'))
      .concat(sourceFiles(resolve(RENDERER_ROOT, 'features/planning')))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) => specifier.startsWith('@features/calendar/'))
          .filter((specifier) => !specifier.startsWith('@features/calendar/api/'))
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });
});
