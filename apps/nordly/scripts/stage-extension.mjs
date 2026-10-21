import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, '../extension/dist');
const staged = resolve(root, 'src-tauri/resources/extension');
const viteCli = resolve(root, 'node_modules/vite/bin/vite.js');

const build = spawnSync(
  process.execPath,
  [viteCli, 'build', '--config', 'extension.vite.config.ts'],
  { cwd: root, stdio: 'inherit' },
);
if (build.error) {
  console.error('extension:stage vite spawn failed:', build.error);
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);

await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });
await cp(dist, staged, { recursive: true });
console.log(`staged extension into ${staged}`);
