import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER_ROOT = resolve(process.cwd(), 'src/renderer/src');
const PAGES_ROOT = resolve(RENDERER_ROOT, 'pages');
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
  it('keeps shared independent from features and composition layers', () => {
    const sharedViolations = sourceFiles(resolve(RENDERER_ROOT, 'shared')).flatMap((path) => {
      const source = relative(RENDERER_ROOT, path);
      return importsOf(path)
        .filter((specifier) => /^@(?:app|features|pages|widgets)\//.test(specifier))
        .map((specifier) => `${source}:${specifier}`);
    });
    expect(sharedViolations).toEqual([]);
  });

  it('keeps features independent from composition layers', () => {
    const featureViolations = sourceFiles(resolve(RENDERER_ROOT, 'features')).flatMap((path) => {
      const source = relative(RENDERER_ROOT, path);
      return importsOf(path)
        .filter((specifier) => /^@(?:app|pages|widgets)\//.test(specifier))
        .map((specifier) => `${source}:${specifier}`);
    });

    expect(featureViolations).toEqual([]);
  });

  it('keeps feature sync independent from React hooks', () => {
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'features'))
      .filter((path) => relative(RENDERER_ROOT, path).split('/').includes('sync'))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) => /^@features\/[^/]+\/hooks(?:\/|$)/.test(specifier))
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });

  it('keeps pages and widgets out of feature persistence and transport internals', () => {
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'pages'))
      .concat(sourceFiles(resolve(RENDERER_ROOT, 'widgets')))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) =>
            /^@features\/[^/]+\/(?:repository|remote|sync|vault)(?:\/|$)/.test(specifier),
          )
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });

  it('keeps pages from importing other pages', () => {
    const violations = sourceFiles(PAGES_ROOT).flatMap((path) => {
      const source = relative(RENDERER_ROOT, path);
      const pageRoot = relative(PAGES_ROOT, path).split('/')[0];
      return importsOf(path)
        .map((specifier) => {
          if (specifier.startsWith('@pages/')) {
            return {
              specifier,
              targetPage: specifier.slice('@pages/'.length).split('/')[0],
            };
          }
          if (!specifier.startsWith('.')) return null;
          const target = resolve(dirname(path), specifier);
          const targetRelative = relative(PAGES_ROOT, target);
          if (targetRelative.startsWith('..')) return null;
          return { specifier, targetPage: targetRelative.split('/')[0] };
        })
        .filter(
          (
            value,
          ): value is {
            specifier: string;
            targetPage: string;
          } => value !== null && value.targetPage !== pageRoot,
        )
        .map(({ specifier }) => `${source}:${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps pages and widgets off calendar cache/connection/worker stores', () => {
    const internals =
      /@features\/calendar\/lib\/(?:googleCalendarSyncWorker|googleCalendarCache|googleCalendarConnectionStore|appleCalendarEventsStore)(?:\/|$)/;
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'pages'))
      .concat(sourceFiles(resolve(RENDERER_ROOT, 'widgets')))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) => internals.test(specifier))
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });

  it('keeps task and planning calendar imports off remote/repository/sync', () => {
    const violations = sourceFiles(resolve(RENDERER_ROOT, 'features/tasks'))
      .concat(sourceFiles(resolve(RENDERER_ROOT, 'features/planning')))
      .flatMap((path) => {
        const source = relative(RENDERER_ROOT, path);
        return importsOf(path)
          .filter((specifier) =>
            /^@features\/calendar\/(?:remote|repository|sync)(?:\/|$)/.test(specifier),
          )
          .map((specifier) => `${source}:${specifier}`);
      });

    expect(violations).toEqual([]);
  });
});
