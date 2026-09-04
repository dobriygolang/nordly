package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const workTaskSelectCols = `id, user_id, status, kind, title, created_at, updated_at, completed_at,
	scheduled_start, scheduled_duration_min, google_event_id, google_calendar_id, epic_id, conference_url,
	conference_provider, zoom_meeting_id, archived_at`

func (r *Repository) ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error) {
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	rows, err := r.conn(ctx).Query(ctx, `
		SELECT `+workTaskSelectCols+`
		FROM work_tasks
		WHERE user_id = $1 AND archived_at IS NULL
		ORDER BY updated_at DESC, created_at DESC
	`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.WorkTask
	for rows.Next() {
		t, err := scanWorkTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (r *Repository) GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error) {
	tid, err := parseID("task_id", taskID)
	if err != nil {
		return nil, err
	}
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	row := r.conn(ctx).QueryRow(ctx, `
		SELECT `+workTaskSelectCols+`
		FROM work_tasks
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, tid, uid)
	task, err := scanWorkTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return task, err
}

func (r *Repository) CreateWorkTask(
	ctx context.Context,
	userID string,
	kind model.WorkKind,
	title string,
	status model.WorkStatus,
) (*model.WorkTask, error) {
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	if !status.IsValid() {
		return nil, fmt.Errorf("%w: invalid status", model.ErrInvalidArgument)
	}
	if !kind.IsValid() {
		return nil, fmt.Errorf("%w: invalid kind", model.ErrInvalidArgument)
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	row := r.conn(ctx).QueryRow(ctx, `
		INSERT INTO work_tasks (id, user_id, status, kind, title)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+workTaskSelectCols+`
	`, id, uid, status, kind, title)
	return scanWorkTask(row)
}

func (r *Repository) PatchWorkTask(
	ctx context.Context,
	taskID, userID string,
	patch model.WorkTaskPatch,
) (*model.WorkTask, error) {
	if err := validateWorkTaskPatch(patch); err != nil {
		return nil, err
	}
	tid, err := parseID("task_id", taskID)
	if err != nil {
		return nil, err
	}
	var epicID uuid.UUID
	if patch.EpicID != nil {
		epicID, err = parseID("epic_id", *patch.EpicID)
		if err != nil {
			return nil, err
		}
	}
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}

	row := r.conn(ctx).QueryRow(ctx, `
		UPDATE work_tasks
		SET title = CASE
				WHEN @set_title THEN @title
				ELSE title
			END,
			status = CASE
				WHEN @set_status THEN @status
				ELSE status
			END,
			kind = CASE
				WHEN @set_kind THEN @kind
				ELSE kind
			END,
			completed_at = CASE
				WHEN @set_status AND @status = 'done' THEN COALESCE(completed_at, now())
				WHEN @set_status THEN NULL
				ELSE completed_at
			END,
			scheduled_start = CASE
				WHEN @set_scheduled_start THEN @scheduled_start
				WHEN @clear_schedule THEN NULL
				ELSE scheduled_start
			END,
			scheduled_duration_min = CASE
				WHEN @set_scheduled_duration THEN @scheduled_duration
				WHEN @clear_schedule THEN NULL
				ELSE scheduled_duration_min
			END,
			google_event_id = CASE
				WHEN @set_google_event_id THEN @google_event_id
				WHEN @clear_google_event OR @clear_conference THEN NULL
				ELSE google_event_id
			END,
			google_calendar_id = CASE
				WHEN @set_google_calendar_id THEN @google_calendar_id
				WHEN @clear_google_event OR @clear_conference THEN NULL
				ELSE google_calendar_id
			END,
			epic_id = CASE
				WHEN @set_epic_id THEN @epic_id
				WHEN @clear_epic THEN NULL
				ELSE epic_id
			END,
			conference_url = CASE
				WHEN @set_conference_url THEN @conference_url
				WHEN @clear_conference THEN NULL
				ELSE conference_url
			END,
			conference_provider = CASE
				WHEN @set_conference_provider THEN @conference_provider
				WHEN @clear_conference THEN NULL
				ELSE conference_provider
			END,
			zoom_meeting_id = CASE
				WHEN @set_zoom_meeting_id THEN @zoom_meeting_id
				WHEN @clear_conference THEN NULL
				ELSE zoom_meeting_id
			END,
			archived_at = CASE
				WHEN @archive THEN now()
				ELSE archived_at
			END,
			updated_at = now()
		WHERE id = @task_id
		  AND user_id = @user_id
		  AND archived_at IS NULL
		RETURNING `+workTaskSelectCols+`
	`, pgx.NamedArgs{
		"task_id":                 tid,
		"user_id":                 uid,
		"set_title":               patch.Title != nil,
		"title":                   stringValue(patch.Title),
		"set_status":              patch.Status != nil,
		"status":                  workStatusValue(patch.Status),
		"set_kind":                patch.Kind != nil,
		"kind":                    workKindValue(patch.Kind),
		"clear_schedule":          patch.ClearSchedule,
		"set_scheduled_start":     patch.ScheduledStart != nil,
		"scheduled_start":         patch.ScheduledStart,
		"set_scheduled_duration":  patch.ScheduledDurationMin != nil,
		"scheduled_duration":      patch.ScheduledDurationMin,
		"clear_google_event":      patch.ClearGoogleEvent,
		"set_google_event_id":     patch.GoogleEventID != nil,
		"google_event_id":         stringValue(patch.GoogleEventID),
		"set_google_calendar_id":  patch.GoogleCalendarID != nil,
		"google_calendar_id":      stringValue(patch.GoogleCalendarID),
		"clear_epic":              patch.ClearEpic,
		"set_epic_id":             patch.EpicID != nil,
		"epic_id":                 epicID,
		"clear_conference":        patch.ClearConference,
		"set_conference_url":      patch.ConferenceURL != nil,
		"conference_url":          stringValue(patch.ConferenceURL),
		"set_conference_provider": patch.ConferenceProvider != nil,
		"conference_provider":     conferenceProviderValue(patch.ConferenceProvider),
		"set_zoom_meeting_id":     patch.ZoomMeetingID != nil,
		"zoom_meeting_id":         stringValue(patch.ZoomMeetingID),
		"archive":                 patch.Archived,
	})
	task, err := scanWorkTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return task, err
}

// ListGoogleEventRefs returns active task links with their exact remote calendar.
func (r *Repository) ListGoogleEventRefs(ctx context.Context, userID string) ([]model.GoogleEventRef, error) {
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	rows, err := r.conn(ctx).Query(ctx, `
		SELECT DISTINCT google_calendar_id, google_event_id
		FROM work_tasks
		WHERE user_id = $1
		  AND archived_at IS NULL
		  AND google_calendar_id IS NOT NULL
		  AND google_calendar_id <> ''
		  AND google_event_id IS NOT NULL
		  AND google_event_id <> ''
	`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]model.GoogleEventRef, 0)
	for rows.Next() {
		var ref model.GoogleEventRef
		if err := rows.Scan(&ref.CalendarID, &ref.EventID); err != nil {
			return nil, err
		}
		out = append(out, ref)
	}
	return out, rows.Err()
}

func (r *Repository) clearAllGoogleEventRefs(ctx context.Context, userID string) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE work_tasks
		SET google_event_id = NULL, google_calendar_id = NULL, updated_at = now()
		WHERE user_id = $1
		  AND archived_at IS NULL
		  AND (google_event_id IS NOT NULL OR google_calendar_id IS NOT NULL)
	`, uid)
	return err
}

func (r *Repository) clearMeetConferenceFields(ctx context.Context, userID string) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE work_tasks
		SET conference_url = NULL,
		    conference_provider = NULL,
		    google_event_id = NULL,
		    google_calendar_id = NULL,
		    updated_at = now()
		WHERE user_id = $1 AND archived_at IS NULL AND conference_provider = $2
	`, uid, model.ConferenceProviderMeet.String())
	return err
}

func (r *Repository) clearZoomConferenceFields(ctx context.Context, userID string) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE work_tasks
		SET conference_url = CASE WHEN conference_provider = $2 THEN NULL ELSE conference_url END,
		    conference_provider = CASE WHEN conference_provider = $2 THEN NULL ELSE conference_provider END,
		    zoom_meeting_id = NULL,
		    updated_at = now()
		WHERE user_id = $1
		  AND archived_at IS NULL
		  AND (conference_provider = $2 OR zoom_meeting_id IS NOT NULL)
	`, uid, model.ConferenceProviderZoom.String())
	return err
}

// ClearGoogleEventByRef unlinks an active task from the exact event deleted remotely.
func (r *Repository) ClearGoogleEventByRef(
	ctx context.Context,
	userID string,
	ref model.GoogleEventRef,
) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE work_tasks
		SET conference_url = CASE
				WHEN conference_provider = $4 THEN NULL
				ELSE conference_url
			END,
			conference_provider = CASE
				WHEN conference_provider = $4 THEN NULL
				ELSE conference_provider
			END,
			google_event_id = NULL,
			google_calendar_id = NULL,
			updated_at = now()
		WHERE user_id = $1
		  AND archived_at IS NULL
		  AND google_calendar_id = $2
		  AND google_event_id = $3
	`, uid, ref.CalendarID, ref.EventID, model.ConferenceProviderMeet)
	return err
}

// DisconnectGoogleLocal atomically clears task links, cache, sync state, and OAuth state.
func (r *Repository) DisconnectGoogleLocal(ctx context.Context, userID string) error {
	return r.WithTx(ctx, func(txCtx context.Context) error {
		if err := r.clearAllGoogleEventRefs(txCtx, userID); err != nil {
			return err
		}
		if err := r.clearMeetConferenceFields(txCtx, userID); err != nil {
			return err
		}
		return r.ClearGoogleConnection(txCtx, userID)
	})
}

// DisconnectZoomLocal atomically clears active Zoom task links and OAuth state.
func (r *Repository) DisconnectZoomLocal(ctx context.Context, userID string) error {
	return r.WithTx(ctx, func(txCtx context.Context) error {
		if err := r.clearZoomConferenceFields(txCtx, userID); err != nil {
			return err
		}
		return r.ClearZoomConnection(txCtx, userID)
	})
}

func scanWorkTask(row pgx.Row) (*model.WorkTask, error) {
	var t model.WorkTask
	var uid uuid.UUID
	var googleEventID *string
	var googleCalendarID *string
	var epicID *string
	err := row.Scan(
		&t.ID, &uid, &t.Status, &t.Kind, &t.Title,
		&t.CreatedAt, &t.UpdatedAt, &t.CompletedAt,
		&t.ScheduledStart, &t.ScheduledDurationMin, &googleEventID,
		&googleCalendarID, &epicID, &t.ConferenceURL, &t.ConferenceProvider, &t.ZoomMeetingID, &t.ArchivedAt,
	)
	if err != nil {
		return nil, err
	}
	t.UserID = uid.String()
	t.GoogleEventID = googleEventID
	t.GoogleCalendarID = googleCalendarID
	t.EpicID = epicID
	return &t, nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func workStatusValue(value *model.WorkStatus) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func workKindValue(value *model.WorkKind) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func conferenceProviderValue(value *model.ConferenceProvider) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func validateWorkTaskPatch(patch model.WorkTaskPatch) error {
	if patch.Title != nil && strings.TrimSpace(*patch.Title) == "" {
		return fmt.Errorf("%w: title cannot be empty", model.ErrInvalidArgument)
	}
	if patch.Status != nil && !patch.Status.IsValid() {
		return fmt.Errorf("%w: invalid status", model.ErrInvalidArgument)
	}
	if patch.Kind != nil && !patch.Kind.IsValid() {
		return fmt.Errorf("%w: invalid kind", model.ErrInvalidArgument)
	}
	if patch.ConferenceProvider != nil && !patch.ConferenceProvider.IsValid() {
		return fmt.Errorf("%w: invalid conference provider", model.ErrInvalidArgument)
	}
	if (patch.ScheduledStart == nil) != (patch.ScheduledDurationMin == nil) {
		return fmt.Errorf("%w: schedule start and duration must be set together", model.ErrInvalidArgument)
	}
	if patch.ScheduledDurationMin != nil && (*patch.ScheduledDurationMin < 15 || *patch.ScheduledDurationMin > 480) {
		return fmt.Errorf("%w: scheduled duration must be 15..480", model.ErrInvalidArgument)
	}
	if (patch.GoogleEventID == nil) != (patch.GoogleCalendarID == nil) {
		return fmt.Errorf("%w: google event and calendar ids must be set together", model.ErrInvalidArgument)
	}
	if patch.GoogleEventID != nil && strings.TrimSpace(*patch.GoogleEventID) == "" {
		return fmt.Errorf("%w: google event id cannot be empty", model.ErrInvalidArgument)
	}
	if patch.GoogleCalendarID != nil && strings.TrimSpace(*patch.GoogleCalendarID) == "" {
		return fmt.Errorf("%w: google calendar id cannot be empty", model.ErrInvalidArgument)
	}
	if patch.ZoomMeetingID != nil && strings.TrimSpace(*patch.ZoomMeetingID) == "" {
		return fmt.Errorf("%w: zoom meeting id cannot be empty", model.ErrInvalidArgument)
	}
	if patch.GoogleEventID != nil && patch.ZoomMeetingID != nil {
		return fmt.Errorf("%w: google and zoom conference ids are mutually exclusive", model.ErrInvalidArgument)
	}
	return nil
}
