package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var focusSessionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "focus_sessions_total",
	Help: "Focus session lifecycle events",
}, []string{"result"})

func IncFocusSession(result string) {
	focusSessionsTotal.WithLabelValues(result).Inc()
}
