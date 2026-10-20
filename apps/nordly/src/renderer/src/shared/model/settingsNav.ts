import { NORDLY_EVENTS } from '@shared/lib/custom-events';

export const SettingsSectionId = {
  General: 'general',
  Integrations: 'integrations',
  FilesLinks: 'files_links',
  Sync: 'sync',
  Shortcuts: 'shortcuts',
  About: 'about',
} as const;
export type SettingsSectionId = (typeof SettingsSectionId)[keyof typeof SettingsSectionId];

export const SettingsHighlightId = {
  NotesSync: 'notes_sync',
  Flashcards: 'flashcards',
} as const;
export type SettingsHighlightId = (typeof SettingsHighlightId)[keyof typeof SettingsHighlightId];

export interface OpenSettingsDetail {
  section?: SettingsSectionId;
  highlight?: SettingsHighlightId;
}

let pending: OpenSettingsDetail | null = null;

export function stageSettingsDetail(detail: OpenSettingsDetail | null): void {
  pending = detail;
}

export function takeSettingsDetail(): OpenSettingsDetail | null {
  const value = pending;
  pending = null;
  return value;
}

export function openSettings(detail?: OpenSettingsDetail): void {
  stageSettingsDetail(detail ?? null);
  window.dispatchEvent(
    new CustomEvent<OpenSettingsDetail | null>(NORDLY_EVENTS.openSettings, {
      detail: detail ?? null,
    }),
  );
}
