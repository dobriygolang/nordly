export const NoteSaveStatus = {
  Idle: 'idle',
  Saving: 'saving',
  Saved: 'saved',
} as const;
export type NoteSaveStatus = (typeof NoteSaveStatus)[keyof typeof NoteSaveStatus];
