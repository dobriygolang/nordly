import { getVersion } from '@tauri-apps/api/app';
import { isTauriRuntime } from '@platform/runtime';

/** Reading a version must not pull the installer into the startup bundle. */
export async function readAppVersion(): Promise<string> {
  if (!isTauriRuntime()) return 'dev';
  return getVersion();
}
