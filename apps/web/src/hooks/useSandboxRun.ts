import { useMutation, useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { getCodeRun, isTerminalRunStatus, runCode } from '@/lib/api/sandbox'
import { formatSandboxRunError } from '@/lib/sandbox/formatRunError'
import type { CodeRun } from '@/lib/types'

export function useSandboxRun(accessToken?: string | null) {
  const [runId, setRunId] = useState<string | null>(null)
  const [outputTab, setOutputTab] = useState<'stdout' | 'stderr'>('stdout')
  const [runError, setRunError] = useState<string | null>(null)
  const [triggeredBy, setTriggeredBy] = useState<string | null>(null)

  const runQ = useQuery({
    queryKey: ['code-run', runId, accessToken ?? ''],
    queryFn: () => getCodeRun(runId!, accessToken),
    enabled: !!runId,
    refetchOnWindowFocus: true,
    refetchInterval: (q) => {
      const status = q.state.data?.run.status
      if (!status || isTerminalRunStatus(status)) return false
      if (typeof document !== 'undefined' && document.hidden) return false
      return 1000
    },
  })

  const runStatus = runQ.data?.run.status
  const refetchRun = runQ.refetch
  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return
      if (!runId || !runStatus || isTerminalRunStatus(runStatus)) return
      void refetchRun()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [runId, runStatus, refetchRun])

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
      setRunError(formatSandboxRunError(err))
      setRunId(null)
    },
  })

  const activeRun = runQ.data?.run
  const running =
    runM.isPending ||
    (!!runId && runQ.isFetching && activeRun == null) ||
    (activeRun != null && !isTerminalRunStatus(activeRun.status))

  useEffect(() => {
    if (!runQ.isError || !runQ.error) return
    setRunError(formatSandboxRunError(runQ.error))
  }, [runQ.isError, runQ.error])

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
