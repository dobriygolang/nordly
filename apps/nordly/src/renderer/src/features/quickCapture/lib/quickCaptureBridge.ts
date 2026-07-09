import { invoke } from '@tauri-apps/api/core';

import {
  defaultQuickCaptureShortcut,
  readSettings,
  type NordlySettings,
} from '@shared/model/settings';
import { isTauriRuntime } from '@platform/runtime';

export interface QuickCaptureApplyResult {
  ok: boolean;
  error?: string;
}

export async function applyQuickCaptureConfig(
  settings: Pick<NordlySettings, 'quickCaptureEnabled' | 'quickCaptureShortcut'> = readSettings(),
): Promise<QuickCaptureApplyResult> {
  if (!isTauriRuntime()) {
    return { ok: true };
  }

  const shortcut = settings.quickCaptureShortcut.trim() || defaultQuickCaptureShortcut();

  return invoke<QuickCaptureApplyResult>('quick_capture_apply_config', {
    enabled: settings.quickCaptureEnabled,
    shortcut,
  });
}

export async function hideQuickCaptureWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('quick_capture_hide');
}
