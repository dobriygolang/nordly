package metrics

import (
	"log"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// WorkTaskAction is a Prometheus label for work-task lifecycle events.
type WorkTaskAction string

const (
	WorkTaskActionCreate       WorkTaskAction = "create"
	WorkTaskActionDelete       WorkTaskAction = "delete"
	WorkTaskActionSchedule     WorkTaskAction = "schedule"
	WorkTaskActionUnschedule   WorkTaskAction = "unschedule"
	WorkTaskActionComplete     WorkTaskAction = "complete"
	WorkTaskActionStatusChange WorkTaskAction = "status_change"
	WorkTaskActionConference   WorkTaskAction = "conference"
)

func (a WorkTaskAction) String() string { return string(a) }

var workTasksTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "tracker_work_tasks_total",
	Help: "Work task lifecycle events",
}, []string{"action"})

var remoteCleanupFailuresTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "tracker_remote_cleanup_failures_total",
	Help: "Best-effort remote cleanup attempts that failed after a local or replacement operation",
}, []string{"provider", "operation"})

func IncWorkTask(action WorkTaskAction) {
	workTasksTotal.WithLabelValues(action.String()).Inc()
}

func ReportRemoteCleanupFailure(provider, operation string, err error) {
	remoteCleanupFailuresTotal.WithLabelValues(provider, operation).Inc()
	log.Printf("tracker remote cleanup failed: provider=%s operation=%s error=%v", provider, operation, err)
}
