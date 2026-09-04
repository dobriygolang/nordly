package start_focus_session

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store creates focus sessions.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	CreateSession(
		ctx context.Context,
		userID string,
		mode focusmodel.SessionMode,
		pinnedTitle string,
		taskID, clientSessionID *string,
		startedAt time.Time,
	) (*focusmodel.Session, bool, error)
	GetSessionByClientID(ctx context.Context, userID, clientSessionID string) (*focusmodel.Session, error)
}

// Handler starts a focus session.
type Handler struct {
	store  Store
	record func(metrics.SessionResult)
}

// New constructs the start-focus-session handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("start_focus_session: Store is required")
	}
	return &Handler{store: store, record: metrics.IncFocusSession}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*focusmodel.Session, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	pinnedTitle, taskID, clientSessionID, startedAt := cmd.Normalized()
	userID := strings.TrimSpace(cmd.UserID)
	if startedAt.Before(cmd.Now.UTC().AddDate(0, 0, -7)) {
		return h.lookupStaleIdempotentStart(ctx, userID, cmd.Mode, pinnedTitle, taskID, clientSessionID, startedAt)
	}
	sess, created, err := h.store.CreateSession(
		ctx,
		userID,
		cmd.Mode,
		pinnedTitle,
		taskID,
		clientSessionID,
		startedAt,
	)
	if err == nil && created {
		h.record(metrics.SessionResultStarted)
	}
	return sess, err
}

func (h *Handler) lookupStaleIdempotentStart(
	ctx context.Context,
	userID string,
	mode focusmodel.SessionMode,
	pinnedTitle string,
	taskID, clientSessionID *string,
	startedAt time.Time,
) (*focusmodel.Session, error) {
	if clientSessionID == nil {
		return nil, focusmodel.ErrInvalidArgument
	}
	existing, err := h.store.GetSessionByClientID(ctx, userID, *clientSessionID)
	if errors.Is(err, focusmodel.ErrNotFound) {
		return nil, focusmodel.ErrInvalidArgument
	}
	if err != nil {
		return nil, err
	}
	if !existing.SameStartPayload(userID, mode, pinnedTitle, taskID, clientSessionID, startedAt) {
		return nil, focusmodel.ErrInvalidArgument
	}
	return existing, nil
}
