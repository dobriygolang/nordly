import type {
  ConferenceProvider,
  TaskKind,
  TaskStatus,
} from './status';

export type TaskEpicSelection =
  | { epicId: string }
  | { color: string }
  | null;

export interface TaskCard {
  id: string;
  status: TaskStatus;
  kind: TaskKind;
  title: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  scheduledStart?: string;
  scheduledDurationMin?: number;
  googleEventId?: string;
  /** Calendar that owns googleEventId. */
  googleCalendarId?: string;
  epicId?: string;
  /** Device-local tint retained for offline epic rows. */
  epicColor?: string;
  conferenceUrl?: string;
  conferenceProvider?: ConferenceProvider;
  zoomMeetingId?: string;
  /** Manual order within a day column. */
  order?: number;
}
