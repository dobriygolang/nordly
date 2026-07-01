package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
)

// UpsertGoogleEvents inserts or updates cached calendar events.
func (r *Repository) UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error {
	if len(events) == 0 {
		return nil
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	batch := r.conn(ctx)
	for _, ev := range events {
		if _, err := batch.Exec(ctx, `
			INSERT INTO google_calendar_events
				(user_id, calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
			ON CONFLICT (user_id, calendar_id, event_id) DO UPDATE SET
				title = EXCLUDED.title,
				start_at = EXCLUDED.start_at,
				end_at = EXCLUDED.end_at,
				all_day = EXCLUDED.all_day,
				editable = EXCLUDED.editable,
				html_link = EXCLUDED.html_link,
				updated_at = now()
		`, uid, ev.CalendarID, ev.EventID, ev.Title, ev.Start.UTC(), ev.End.UTC(), ev.AllDay, ev.Editable, ev.HTMLLink); err != nil {
			return fmt.Errorf("upsert google event: %w", err)
		}
	}
	return nil
}

// DeleteGoogleEventsByCalendar removes all cached events for one calendar.
func (r *Repository) DeleteGoogleEventsByCalendar(ctx context.Context, userID, calendarID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		DELETE FROM google_calendar_events
		WHERE user_id = $1 AND calendar_id = $2
	`, uid, calendarID)
	return err
}

// DeleteGoogleEvents removes cached events by id.
func (r *Repository) DeleteGoogleEvents(ctx context.Context, userID, calendarID string, eventIDs []string) error {
	if len(eventIDs) == 0 {
		return nil
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		DELETE FROM google_calendar_events
		WHERE user_id = $1 AND calendar_id = $2 AND event_id = ANY($3)
	`, uid, calendarID, eventIDs)
	return err
}

// ClearGoogleEventsCache removes all cached events for a user.
func (r *Repository) ClearGoogleEventsCache(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `DELETE FROM google_calendar_events WHERE user_id = $1`, uid)
	return err
}

// ListGoogleEventsForUser returns cached events from all synced calendars overlapping the window.
func (r *Repository) ListGoogleEventsForUser(
	ctx context.Context,
	userID string,
	timeMin, timeMax time.Time,
) ([]model.CachedCalendarEvent, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	rows, err := r.conn(ctx).Query(ctx, `
		SELECT calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link
		FROM google_calendar_events
		WHERE user_id = $1
		  AND ($2::timestamptz IS NULL OR end_at >= $2)
		  AND ($3::timestamptz IS NULL OR start_at < $3)
		ORDER BY start_at
	`, uid, nullableTime(timeMin), nullableTime(timeMax))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.CachedCalendarEvent
	for rows.Next() {
		var ev model.CachedCalendarEvent
		if err := rows.Scan(&ev.CalendarID, &ev.EventID, &ev.Title,
			&ev.Start, &ev.End, &ev.AllDay, &ev.Editable, &ev.HTMLLink); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

// ListGoogleEvents returns cached events for a calendar overlapping [timeMin, timeMax).
func (r *Repository) ListGoogleEvents(
	ctx context.Context,
	userID, calendarID string,
	timeMin, timeMax time.Time,
) ([]model.CachedCalendarEvent, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	rows, err := r.conn(ctx).Query(ctx, `
		SELECT calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link
		FROM google_calendar_events
		WHERE user_id = $1 AND calendar_id = $2
		  AND ($3::timestamptz IS NULL OR end_at >= $3)
		  AND ($4::timestamptz IS NULL OR start_at < $4)
		ORDER BY start_at
	`, uid, calendarID, nullableTime(timeMin), nullableTime(timeMax))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.CachedCalendarEvent
	for rows.Next() {
		var ev model.CachedCalendarEvent
		if err := rows.Scan(&ev.CalendarID, &ev.EventID, &ev.Title,
			&ev.Start, &ev.End, &ev.AllDay, &ev.Editable, &ev.HTMLLink); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

func nullableTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	u := t.UTC()
	return &u
}
