package ops

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestIPLimiterEvictsEmptyAndStaleKeys(t *testing.T) {
	t.Parallel()
	base := time.Date(2026, time.August, 27, 12, 0, 0, 0, time.UTC)
	limiter := newIPLimiter(2)
	limiter.window = time.Minute
	limiter.lastSweep = base

	require.True(t, limiter.allowAt("stale", base))
	require.True(t, limiter.allowAt("active", base.Add(30*time.Second)))
	limiter.hits["empty"] = nil
	require.True(t, limiter.allowAt("trigger", base.Add(61*time.Second)))

	_, staleExists := limiter.hits["stale"]
	_, emptyExists := limiter.hits["empty"]
	_, activeExists := limiter.hits["active"]
	require.False(t, staleExists)
	require.False(t, emptyExists)
	require.True(t, activeExists)
}
