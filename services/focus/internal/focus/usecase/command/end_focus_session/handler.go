package end_focus_session

import (
	"context"
	"errors"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store ends focus sessions.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	EndSession(
		ctx context.Context,
		userID, sessionID string,
		secondsFocused, pomodorosCompleted int,
		endedAt time.Time,
	) (*focusmodel.Session, focusmodel.SessionEndOutcome, error)
}

// Handler ends a focus session.
type Handler struct {
	store  Store
	record func(metrics.SessionResult)
}

// New constructs the end-focus-session handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("end_focus_session: Store is required")
	}
	return &Handler{store: store, record: metrics.IncFocusSession}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*focusmodel.Session, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	userID, sessionID, endedAt := cmd.Normalized()
	sess, outcome, err := h.store.EndSession(
		ctx,
		userID,
		sessionID,
		cmd.SecondsFocused,
		cmd.PomodorosCompleted,
		endedAt,
	)
	if err == nil && outcome.Transitioned() {
		if cmd.SecondsFocused > 0 || cmd.PomodorosCompleted > 0 {
			h.record(metrics.SessionResultCompleted)
		} else {
			h.record(metrics.SessionResultAbandoned)
		}
	}
	return sess, err
}
