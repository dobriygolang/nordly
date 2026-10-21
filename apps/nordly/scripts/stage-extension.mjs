import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, '../extension/dist');
const staged = resolve(root, 'src-tauri/resources/extension');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['run', 'extension:build'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

await rm(staged, { recursive: true, force: true });
await mkdir(staged, { recursive: true });
await cp(dist, staged, { recursive: true });
console.log(`staged extension into ${staged}`);
