export const CalendarEditorKind = {
  Google: 'google',
  Task: 'task',
} as const;
export type CalendarEditorKind = (typeof CalendarEditorKind)[keyof typeof CalendarEditorKind];

export const CalendarEditorMode = {
  Create: 'create',
  Edit: 'edit',
} as const;
export type CalendarEditorMode = (typeof CalendarEditorMode)[keyof typeof CalendarEditorMode];
