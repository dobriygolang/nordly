import { translate } from '@nordly-i18n';

import { notify, type NotifyOptions } from '@shared/api/notifications';

const PREVIEW_GAP_MS = 3_500;

interface NotificationSample {
  id: string;
  title: string;
  body: string;
  options?: NotifyOptions;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatPreviewTime(): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
}

/** All Nordly banner types — temporary dev helper, remove after UX approval. */
export function listNotificationSamples(): NotificationSample[] {
  const time = formatPreviewTime();
  return [
    {
      id: 'session',
      title: translate('nordly.notify.session_title'),
      body: translate('nordly.notify.session_body'),
      options: { sound: 'session', force: true },
    },
    {
      id: 'google',
      title: translate('nordly.calendar.reminder.google_title'),
      body: translate('nordly.calendar.reminder.body', {
        title: translate('nordly.calendar.reminder.preview_event'),
        time,
      }),
      options: { sound: 'calendar', force: true },
    },
    {
      id: 'update',
      title: translate('nordly.settings.update.notify_title'),
      body: translate('nordly.settings.update.notify_body', {
        published: 'v0.0.2',
        version: 'v0.0.1',
      }),
      options: { force: true },
    },
  ];
}

export async function previewAllNotifications(
  onProgress?: (current: number, total: number, sample: NotificationSample) => void,
): Promise<void> {
  const samples = listNotificationSamples();
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    onProgress?.(i + 1, samples.length, sample);
    await notify(sample.title, sample.body, sample.options);
    if (i < samples.length - 1) {
      await sleep(PREVIEW_GAP_MS);
    }
  }
}
