package product

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	usageConsumeTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "billing_usage_consume_total",
		Help: "Usage quota consume attempts by entitlement and outcome",
	}, []string{"entitlement", "result"})

	subscriptionsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "billing_subscriptions_total",
		Help: "Subscription lifecycle events",
	}, []string{"action", "plan"})

	webhookEventsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "billing_webhook_events_total",
		Help: "Billing provider webhook events",
	}, []string{"provider", "event", "result"})
)

func IncUsageConsume(entitlement, result string) {
	usageConsumeTotal.WithLabelValues(entitlement, result).Inc()
}

func IncSubscription(action, plan string) {
	if plan == "" {
		plan = "unknown"
	}
	subscriptionsTotal.WithLabelValues(action, plan).Inc()
}

func IncWebhook(provider, event, result string) {
	if event == "" {
		event = "unknown"
	}
	webhookEventsTotal.WithLabelValues(provider, event, result).Inc()
}
