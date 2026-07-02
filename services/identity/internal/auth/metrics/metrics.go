package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var authTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "identity_auth_total",
	Help: "Authentication attempts by method and outcome",
}, []string{"method", "result"})

func IncAuth(method, result string) {
	authTotal.WithLabelValues(method, result).Inc()
}
