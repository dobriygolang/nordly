package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	focusrepo "github.com/dobriygolang/project-nordly/services/focus/internal/focus/repository"
	"github.com/google/uuid"
)

const (
	maxFocusSessionSeconds = 24 * 60 * 60
	staleSessionAge        = 24 * time.Hour
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
	repo focusrepo.Store
}

// Deps holds service dependencies.
type Deps struct {
	Repo focusrepo.Store
}

// New constructs the domain service.
func New(deps Deps) Service {
	return &focusService{repo: deps.Repo}
}

func (s *focusService) StartFocusSession(
	ctx context.Context,
	userID, mode, pinnedTitle, taskID, clientSessionID string,
	startedAt *time.Time,
) (*focusmodel.Session, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrInvalidArgument
	}
	mode = strings.TrimSpace(mode)
	if mode == "" {
		mode = "pomodoro"
	}
	if mode != "pomodoro" && mode != "stopwatch" {
		return nil, ErrInvalidArgument
	}
	var taskPtr *string
	if tid := strings.TrimSpace(taskID); tid != "" {
		taskPtr = &tid
	}
	var clientSessionPtr *string
	if clientID := strings.TrimSpace(clientSessionID); clientID != "" {
		if _, err := uuid.Parse(clientID); err != nil {
			return nil, ErrInvalidArgument
		}
		clientSessionPtr = &clientID
	}
	sess, err := s.repo.CreateSession(
		ctx,
		userID,
		mode,
		strings.TrimSpace(pinnedTitle),
		taskPtr,
		clientSessionPtr,
		startedAt,
	)
	if err == nil {
		metrics.IncFocusSession("started")
	}
	return sess, err
}

func (s *focusService) EndFocusSession(
	ctx context.Context,
	userID, sessionID string,
	secondsFocused, pomodorosCompleted int,
	endedAt *time.Time,
) (*focusmodel.Session, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(sessionID) == "" {
		return nil, ErrInvalidArgument
	}
	if secondsFocused < 0 || secondsFocused > maxFocusSessionSeconds || pomodorosCompleted < 0 {
		return nil, ErrInvalidArgument
	}
	sess, err := s.repo.EndSession(
		ctx,
		userID,
		sessionID,
		secondsFocused,
		pomodorosCompleted,
		endedAt,
	)
	if errors.Is(err, focusmodel.ErrNotFound) {
		return nil, ErrNotFound
	}
	if err == nil {
		if secondsFocused > 0 || pomodorosCompleted > 0 {
			metrics.IncFocusSession("completed")
		} else {
			metrics.IncFocusSession("abandoned")
		}
	}
	return sess, err
}

func (s *focusService) CleanupAbandonedSessions(ctx context.Context, now time.Time) (int64, error) {
	count, err := s.repo.AbandonSessionsStartedBefore(ctx, now.UTC().Add(-staleSessionAge))
	if err != nil {
		return 0, err
	}
	for range count {
		metrics.IncFocusSession("abandoned")
	}
	return count, nil
}

func (s *focusService) GetStats(ctx context.Context, userID, upToDate string) (*focusmodel.Stats, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrInvalidArgument
	}
	upTo := time.Now().UTC().Truncate(24 * time.Hour)
	if d := strings.TrimSpace(upToDate); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err != nil {
			return nil, ErrInvalidArgument
		}
		upTo = parsed.UTC()
	}
	return s.repo.GetStats(ctx, userID, upTo)
}

// IsNotFound reports whether err is a not-found error.
func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

// IsInvalidArgument reports whether err is an invalid-argument error.
func IsInvalidArgument(err error) bool {
	return errors.Is(err, ErrInvalidArgument)
}
