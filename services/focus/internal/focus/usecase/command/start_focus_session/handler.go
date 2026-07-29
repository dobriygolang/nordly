package start_focus_session

import (
	"context"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store creates focus sessions.
type Store interface {
	CreateSession(
		ctx context.Context,
		userID, mode, pinnedTitle string,
		taskID, clientSessionID *string,
		startedAt *time.Time,
	) (*focusmodel.Session, error)
}

// Handler starts a focus session.
type Handler struct {
	store Store
}

// New constructs the start-focus-session handler.
func New(store Store) *Handler {
	if store == nil {
		panic("start_focus_session: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*focusmodel.Session, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	mode, pinnedTitle, taskID, clientSessionID := cmd.Normalized()
	sess, err := h.store.CreateSession(
		ctx,
		strings.TrimSpace(cmd.UserID),
		mode,
		pinnedTitle,
		taskID,
		clientSessionID,
		cmd.StartedAt,
	)
	if err == nil {
		metrics.IncFocusSession("started")
	}
	return sess, err
}
