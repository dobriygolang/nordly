package repository

import (
	"context"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store is the persistence port consumed by the domain layer.
type Store interface {
	CreateSession(
		ctx context.Context,
		userID, mode, pinnedTitle string,
		taskID, clientSessionID *string,
		startedAt *time.Time,
	) (*focusmodel.Session, error)
	EndSession(
		ctx context.Context,
		userID, sessionID string,
		secondsFocused, pomodorosCompleted int,
		endedAt *time.Time,
	) (*focusmodel.Session, error)
	AbandonSessionsStartedBefore(ctx context.Context, cutoff time.Time) (int64, error)
	GetStats(ctx context.Context, userID string, upTo time.Time) (*focusmodel.Stats, error)
}

var _ Store = (*Repository)(nil)
