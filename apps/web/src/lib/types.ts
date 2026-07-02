export interface PlanEntitlementSpec {
  type: string
  limit?: number
  unlimited?: boolean
  period?: string
  value?: boolean
}

export interface PlanCatalogEntry {
  slug: string
  name: string
  tagline: string
  limits?: Record<string, PlanEntitlementSpec>
}

export interface CodeRun {
  id: string
  user_id: string
  language: string
  status: string
  run_type: string
  stdout?: string
  stderr?: string
  compile_output?: string
  error?: string
  exit_code?: number
  time_ms?: number
  memory_kb?: number
  tests_total: number
  tests_passed: number
  runner?: string
  created_at?: string
  updated_at?: string
}
