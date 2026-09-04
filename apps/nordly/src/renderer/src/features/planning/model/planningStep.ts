export const PlanningStep = {
  Pick: 'pick',
  Defer: 'defer',
  Finalize: 'finalize',
} as const;
export type PlanningStep = (typeof PlanningStep)[keyof typeof PlanningStep];
