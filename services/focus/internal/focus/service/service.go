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
		mode focusmodel.SessionMode,
		pinnedTitle, taskID, clientSessionID string,
		startedAt *time.Time,
	) (*focusmodel.Session, error)
	EndFocusSession(
		ctx context.Context,
		userID, sessionID string,
		secondsFocused, pomodorosCompleted int,
		endedAt *time.Time,
	) (*focusmodel.Session, error)
	CleanupAbandonedSessions(ctx context.Context) (int64, error)
	GetStats(ctx context.Context, userID, upToDate string) (*focusmodel.Stats, error)
}

type focusService struct {
	startSession *start_focus_session.Handler
	endSession   *end_focus_session.Handler
	cleanup      *cleanup_abandoned_sessions.Handler
	getStats     *get_stats.Handler
	now          func() time.Time
}

// Deps holds service dependencies.
type Deps struct {
	Repo focusrepo.Store
	Now  func() time.Time
}

// New constructs the domain service.
func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("focus service: Repo is required")
	}
	if deps.Now == nil {
		return nil, errors.New("focus service: Now is required")
	}
	startSession, err := start_focus_session.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	endSession, err := end_focus_session.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	cleanup, err := cleanup_abandoned_sessions.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	getStats, err := get_stats.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	return &focusService{
		startSession: startSession,
		endSession:   endSession,
		cleanup:      cleanup,
		getStats:     getStats,
		now:          deps.Now,
	}, nil
}

func (s *focusService) StartFocusSession(
	ctx context.Context,
	userID string,
	mode focusmodel.SessionMode,
	pinnedTitle, taskID, clientSessionID string,
	startedAt *time.Time,
) (*focusmodel.Session, error) {
	return s.startSession.Handle(ctx, start_focus_session.Command{
		UserID:          userID,
		Mode:            mode,
		PinnedTitle:     pinnedTitle,
		TaskID:          taskID,
		ClientSessionID: clientSessionID,
		StartedAt:       startedAt,
		Now:             s.now().UTC(),
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
		Now:                s.now().UTC(),
	})
}

func (s *focusService) CleanupAbandonedSessions(ctx context.Context) (int64, error) {
	return s.cleanup.Handle(ctx, cleanup_abandoned_sessions.Command{Now: s.now().UTC()})
}

func (s *focusService) GetStats(ctx context.Context, userID, upToDate string) (*focusmodel.Stats, error) {
	return s.getStats.Handle(ctx, get_stats.Query{UserID: userID, UpToDate: upToDate, Now: s.now().UTC()})
}

// IsNotFound reports whether err is a not-found error.
func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

// IsInvalidArgument reports whether err is an invalid-argument error.
func IsInvalidArgument(err error) bool {
	return errors.Is(err, ErrInvalidArgument)
}
