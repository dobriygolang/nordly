import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { getCodeRun, isTerminalRunStatus, runCode } from '@/lib/api/sandbox'
import { formatSandboxRunError } from '@/lib/sandbox/formatRunError'
import { useI18n } from '@/lib/i18n'
import type { CodeRun } from '@/lib/types'

export function useSandboxRun(accessToken?: string | null) {
  const { t } = useI18n()
  const [runId, setRunId] = useState<string | null>(null)
  const [outputTab, setOutputTab] = useState<'stdout' | 'stderr'>('stdout')
  const [runError, setRunError] = useState<string | null>(null)
  const [triggeredBy, setTriggeredBy] = useState<string | null>(null)

  const runQ = useQuery({
    queryKey: ['code-run', runId, accessToken ?? ''],
    queryFn: () => getCodeRun(runId!, accessToken),
    enabled: !!runId,
    refetchInterval: (q) => {
      const status = q.state.data?.run.status
      if (!status || isTerminalRunStatus(status)) return false
      return 1000
    },
  })

  const runM = useMutation({
    mutationFn: (input: {
      language: string
      code: string
    }) => runCode(input, accessToken),
    onSuccess: (data) => {
      setRunId(data.run.id)
      setRunError(null)
      const run = data.run
      if (run.stderr && !run.stdout) setOutputTab('stderr')
      else setOutputTab('stdout')
    },
    onError: (err) => {
      setRunError(
        formatSandboxRunError(err, {
          quota: t('session.editorRunQuota'),
          proFeature: t('session.editorRunProFeature'),
        }),
      )
      setRunId(null)
    },
  })

  const activeRun = runQ.data?.run
  const running =
    runM.isPending || (activeRun != null && !isTerminalRunStatus(activeRun.status))

  const followRun = useCallback((id: string, actor?: string) => {
    setRunId(id)
    setRunError(null)
    setTriggeredBy(actor ?? null)
    setOutputTab('stdout')
  }, [])

  const executeRun = useCallback(
    async (input: {
      language: string
      code: string
      triggeredBy?: string
    }) => {
      if (running) return null
      setRunError(null)
      setTriggeredBy(input.triggeredBy ?? null)
      const result = await runM.mutateAsync({ language: input.language, code: input.code })
      return result.run.id
    },
    [runM, running],
  )

  return {
    outputTab,
    setOutputTab,
    runError,
    running,
    activeRun: activeRun as CodeRun | undefined,
    triggeredBy,
    executeRun,
    followRun,
  }
}
