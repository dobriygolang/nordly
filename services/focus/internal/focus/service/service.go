package service

import (
	"context"
	"errors"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	focusrepo "github.com/dobriygolang/project-nordly/services/focus/internal/focus/repository"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/cleanup_abandoned_sessions"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/end_focus_session"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/start_focus_session"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/query/get_stats"
)

// ErrNotFound is returned when an entity does not exist.
var ErrNotFound = focusmodel.ErrNotFound

// ErrInvalidArgument is returned when required input is missing or malformed.
var ErrInvalidArgument = focusmodel.ErrInvalidArgument

// Service is the focus domain API.
type Service interface {
	StartFocusSession(
		ctx context.Context,
		userID string,
		mode, pinnedTitle, taskID, clientSessionID string,
		startedAt *time.Time,
	) (*focusmodel.Session, error)
	EndFocusSession(
		ctx context.Context,
		userID, sessionID string,
		secondsFocused, pomodorosCompleted int,
		endedAt *time.Time,
	) (*focusmodel.Session, error)
	CleanupAbandonedSessions(ctx context.Context, now time.Time) (int64, error)
	GetStats(ctx context.Context, userID, upToDate string) (*focusmodel.Stats, error)
}

type focusService struct {
	startSession *start_focus_session.Handler
	endSession   *end_focus_session.Handler
	cleanup      *cleanup_abandoned_sessions.Handler
	getStats     *get_stats.Handler
}

// Deps holds service dependencies.
type Deps struct {
	Repo focusrepo.Store
}

// New constructs the domain service.
func New(deps Deps) Service {
	if deps.Repo == nil {
		panic("focus service: Repo is required")
	}
	return &focusService{
		startSession: start_focus_session.New(deps.Repo),
		endSession:   end_focus_session.New(deps.Repo),
		cleanup:      cleanup_abandoned_sessions.New(deps.Repo),
		getStats:     get_stats.New(deps.Repo),
	}
}

func (s *focusService) StartFocusSession(
	ctx context.Context,
	userID, mode, pinnedTitle, taskID, clientSessionID string,
	startedAt *time.Time,
) (*focusmodel.Session, error) {
	return s.startSession.Handle(ctx, start_focus_session.Command{
		UserID:          userID,
		Mode:            mode,
		PinnedTitle:     pinnedTitle,
		TaskID:          taskID,
		ClientSessionID: clientSessionID,
		StartedAt:       startedAt,
	})
}

func (s *focusService) EndFocusSession(
	ctx context.Context,
	userID, sessionID string,
	secondsFocused, pomodorosCompleted int,
	endedAt *time.Time,
) (*focusmodel.Session, error) {
	return s.endSession.Handle(ctx, end_focus_session.Command{
		UserID:             userID,
		SessionID:          sessionID,
		SecondsFocused:     secondsFocused,
		PomodorosCompleted: pomodorosCompleted,
		EndedAt:            endedAt,
	})
}

func (s *focusService) CleanupAbandonedSessions(ctx context.Context, now time.Time) (int64, error) {
	return s.cleanup.Handle(ctx, cleanup_abandoned_sessions.Command{Now: now})
}

func (s *focusService) GetStats(ctx context.Context, userID, upToDate string) (*focusmodel.Stats, error) {
	return s.getStats.Handle(ctx, get_stats.Query{UserID: userID, UpToDate: upToDate})
}

// IsNotFound reports whether err is a not-found error.
func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

// IsInvalidArgument reports whether err is an invalid-argument error.
func IsInvalidArgument(err error) bool {
	return errors.Is(err, ErrInvalidArgument)
}
