package ops

import (
	"slices"
	"sync"
	"time"
)

type ipLimiter struct {
	max       int
	window    time.Duration
	mu        sync.Mutex
	hits      map[string][]time.Time
	lastSweep time.Time
}

func newIPLimiter(maxPerMinute int) *ipLimiter {
	return &ipLimiter{
		max:       maxPerMinute,
		window:    time.Minute,
		hits:      make(map[string][]time.Time),
		lastSweep: time.Now(),
	}
}

func (l *ipLimiter) allow(key string) bool {
	return l.allowAt(key, time.Now())
}

func (l *ipLimiter) allowAt(key string, now time.Time) bool {
	cutoff := now.Add(-l.window)

	l.mu.Lock()
	defer l.mu.Unlock()

	if !now.Before(l.lastSweep.Add(l.window)) {
		for ip, hits := range l.hits {
			alive := aliveHits(hits, cutoff)
			if len(alive) == 0 {
				delete(l.hits, ip)
				continue
			}
			l.hits[ip] = alive
		}
		l.lastSweep = now
	}

	alive := aliveHits(l.hits[key], cutoff)
	if len(alive) >= l.max {
		l.hits[key] = alive
		return false
	}
	l.hits[key] = append(alive, now)
	return true
}

func aliveHits(hits []time.Time, cutoff time.Time) []time.Time {
	return slices.DeleteFunc(hits, func(hit time.Time) bool {
		return !hit.After(cutoff)
	})
}
