import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const manifestPath = resolve(dist, '.vite/manifest.json');

const budgets = {
  main: { source: 'index.html', bytes: 410 * 1024 },
  Notes: { source: 'src/pages/Notes.tsx', bytes: 1210 * 1024 },
  Whiteboard: { entry: 'whiteboard', bytes: 1785 * 1024 },
};

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

function findSourceEntry(source) {
  const matches = Object.entries(manifest).filter(
    ([key, entry]) => key === source || entry.src === source,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Expected one manifest entry for ${source}, found ${matches.length}. Build with npm run build:vite first.`,
    );
  }
  return matches[0][0];
}

function findWhiteboardEntry() {
  const matches = Object.entries(manifest).filter(([, entry]) =>
    entry.dynamicImports?.some((key) => key.includes('@excalidraw/excalidraw/dist/prod/subset-worker')),
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one Excalidraw route entry, found ${matches.length}`);
  }
  return matches[0][0];
}

function collectStaticAssets(key, assets = new Set(), visited = new Set()) {
  if (visited.has(key)) return assets;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`Manifest import ${key} is missing`);
  assets.add(entry.file);
  for (const css of entry.css ?? []) assets.add(css);
  for (const imported of entry.imports ?? []) collectStaticAssets(imported, assets, visited);
  return assets;
}

async function measure(budget) {
  const key = budget.entry === 'whiteboard'
    ? findWhiteboardEntry()
    : findSourceEntry(budget.source);
  const assets = [...collectStaticAssets(key)].sort();
  const sizes = await Promise.all(assets.map(async (asset) => (await stat(resolve(dist, asset))).size));
  return { assets, bytes: sizes.reduce((total, size) => total + size, 0) };
}

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

let failed = false;
for (const [name, budget] of Object.entries(budgets)) {
  const result = await measure(budget);
  const status = result.bytes <= budget.bytes ? 'PASS' : 'FAIL';
  console.log(
    `${status} ${name}: ${formatKiB(result.bytes)} / ${formatKiB(budget.bytes)} (${result.assets.length} static assets)`,
  );
  if (result.bytes > budget.bytes) failed = true;
}

if (failed) process.exitCode = 1;
