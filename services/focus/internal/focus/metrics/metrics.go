package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// SessionResult is a Prometheus label for focus-session lifecycle events.
type SessionResult string

const (
	SessionResultStarted   SessionResult = "started"
	SessionResultCompleted SessionResult = "completed"
	SessionResultAbandoned SessionResult = "abandoned"
)

func (r SessionResult) String() string { return string(r) }

var focusSessionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "focus_sessions_total",
	Help: "Focus session lifecycle events",
}, []string{"result"})

func IncFocusSession(result SessionResult) {
	focusSessionsTotal.WithLabelValues(result.String()).Inc()
}
