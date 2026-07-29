package end_focus_session

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store ends focus sessions.
type Store interface {
	EndSession(
		ctx context.Context,
		userID, sessionID string,
		secondsFocused, pomodorosCompleted int,
		endedAt *time.Time,
	) (*focusmodel.Session, error)
}

// Handler ends a focus session.
type Handler struct {
	store Store
}

// New constructs the end-focus-session handler.
func New(store Store) *Handler {
	if store == nil {
		panic("end_focus_session: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*focusmodel.Session, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	sess, err := h.store.EndSession(
		ctx,
		strings.TrimSpace(cmd.UserID),
		strings.TrimSpace(cmd.SessionID),
		cmd.SecondsFocused,
		cmd.PomodorosCompleted,
		cmd.EndedAt,
	)
	if errors.Is(err, focusmodel.ErrNotFound) {
		return nil, focusmodel.ErrNotFound
	}
	if err == nil {
		if cmd.SecondsFocused > 0 || cmd.PomodorosCompleted > 0 {
			metrics.IncFocusSession("completed")
		} else {
			metrics.IncFocusSession("abandoned")
		}
	}
	return sess, err
}
