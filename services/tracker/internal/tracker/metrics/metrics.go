package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var workTasksTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "tracker_work_tasks_total",
	Help: "Work task lifecycle events",
}, []string{"action"})

func IncWorkTask(action string) {
	workTasksTotal.WithLabelValues(action).Inc()
}
