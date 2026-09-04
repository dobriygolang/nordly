export const CODE_RUN_STATUSES = [
  'queued',
  'running',
  'success',
  'compile_error',
  'runtime_error',
  'timeout',
  'internal_error',
] as const

export type CodeRunStatus = (typeof CODE_RUN_STATUSES)[number]

export interface CodeRun {
  id: string
  user_id: string
  language: string
  status: CodeRunStatus
  stdout?: string
  stderr?: string
  compile_output?: string
  error?: string
  exit_code?: number
  time_ms?: number
  runner?: string
  created_at?: string
  updated_at?: string
}
