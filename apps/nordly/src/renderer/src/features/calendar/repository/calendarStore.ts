/** IndexedDB persistence for Google Calendar snapshots — survive reload offline. */

import {
  dbDelete,
  dbGet,
  dbGetAllByUser,
  dbPut,
  requireUserId,
} from '@shared/db/nordlyDb';

import type { GoogleCalendarEvent } from '../model/calendar';

const SNAPSHOT_ID = 'google_snapshot';

export interface CalendarSnapshotRecord {
  key: string;
  userId: string;
  id: string;
  timeMin: number;
  timeMax: number;
  events: GoogleCalendarEvent[];
  fetchedAt: number;
}

function snapshotKey(userId: string): string {
  return `${userId}::${SNAPSHOT_ID}`;
}

export async function calendarStoreLoadSnapshot(
  userId?: string,
): Promise<CalendarSnapshotRecord | null> {
  const uid = userId ?? requireUserId();
  return dbGet<CalendarSnapshotRecord>('calendar_events', snapshotKey(uid));
}

export async function calendarStoreSaveSnapshot(
  events: GoogleCalendarEvent[],
  timeMin: Date,
  timeMax: Date,
  userId?: string,
): Promise<void> {
  const uid = userId ?? requireUserId();
  const row: CalendarSnapshotRecord = {
    key: snapshotKey(uid),
    userId: uid,
    id: SNAPSHOT_ID,
    timeMin: timeMin.getTime(),
    timeMax: timeMax.getTime(),
    events,
    fetchedAt: Date.now(),
  };
  await dbPut('calendar_events', row);
}

export async function calendarStoreClear(userId?: string): Promise<void> {
  const uid = userId ?? requireUserId();
  const rows = await dbGetAllByUser<{ key: string; userId: string }>('calendar_events', uid);
  for (const row of rows) {
    await dbDelete('calendar_events', row.key);
  }
}
