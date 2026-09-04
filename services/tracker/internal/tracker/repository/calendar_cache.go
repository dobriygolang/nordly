package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// UpsertGoogleEvents inserts or updates cached calendar events.
func (r *Repository) UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error {
	if len(events) == 0 {
		return nil
	}
	return r.WithTx(ctx, func(txCtx context.Context) error {
		uid, err := parseUserID(userID)
		if err != nil {
			return err
		}
		for _, ev := range events {
			if strings.TrimSpace(ev.CalendarID) == "" || strings.TrimSpace(ev.EventID) == "" {
				return model.ErrInvalidArgument
			}
			if _, err := r.conn(txCtx).Exec(txCtx, `
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
				return err
			}
		}
		return nil
	})
}

// DeleteGoogleEventsByCalendar removes all cached events for one calendar.
func (r *Repository) DeleteGoogleEventsByCalendar(ctx context.Context, userID, calendarID string) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
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
	uid, err := parseUserID(userID)
	if err != nil {
		return err
	}
	_, err = r.conn(ctx).Exec(ctx, `
		DELETE FROM google_calendar_events
		WHERE user_id = $1 AND calendar_id = $2 AND event_id = ANY($3)
	`, uid, calendarID, eventIDs)
	return err
}

// ClearGoogleEventsCache removes all cached events for a user.
func (r *Repository) ClearGoogleEventsCache(ctx context.Context, userID string) error {
	uid, err := parseUserID(userID)
	if err != nil {
		return err
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
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
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

func nullableTime(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	u := t.UTC()
	return &u
}

// ApplyGoogleCalendarSyncDelta atomically applies one remote delta and advances
// the matching sync token. Remote calls must complete before this method starts.
func (r *Repository) ApplyGoogleCalendarSyncDelta(
	ctx context.Context,
	userID string,
	delta model.CalendarSyncDelta,
) error {
	if strings.TrimSpace(delta.CalendarID) == "" {
		return model.ErrInvalidArgument
	}
	if strings.TrimSpace(delta.NextSyncToken) == "" {
		return errors.New("apply google calendar sync delta: next sync token is required")
	}
	for _, event := range delta.Upserts {
		if event.CalendarID != delta.CalendarID {
			return errors.New("apply google calendar sync delta: event calendar id mismatch")
		}
	}
	for _, eventID := range delta.DeletedIDs {
		if strings.TrimSpace(eventID) == "" {
			return errors.New("apply google calendar sync delta: deleted event id is required")
		}
	}
	return r.WithTx(ctx, func(txCtx context.Context) error {
		if delta.Replace {
			if err := r.DeleteGoogleEventsByCalendar(txCtx, userID, delta.CalendarID); err != nil {
				return err
			}
		}
		if err := r.UpsertGoogleEvents(txCtx, userID, delta.Upserts); err != nil {
			return err
		}
		if err := r.DeleteGoogleEvents(txCtx, userID, delta.CalendarID, delta.DeletedIDs); err != nil {
			return err
		}
		for _, eventID := range delta.DeletedIDs {
			if err := r.ClearGoogleEventByRef(txCtx, userID, model.GoogleEventRef{
				CalendarID: delta.CalendarID,
				EventID:    eventID,
			}); err != nil {
				return err
			}
		}
		return r.SaveGoogleCalendarSyncToken(txCtx, userID, delta.CalendarID, delta.NextSyncToken)
	})
}

// PruneGoogleCalendarData atomically removes cache and sync state for calendars
// no longer returned by Google.
func (r *Repository) PruneGoogleCalendarData(ctx context.Context, userID string, calendarIDs []string) error {
	return r.WithTx(ctx, func(txCtx context.Context) error {
		uid, err := parseUserID(userID)
		if err != nil {
			return err
		}
		if _, err := r.conn(txCtx).Exec(txCtx, `
			UPDATE work_tasks
			SET conference_url = CASE
					WHEN conference_provider = $3 THEN NULL
					ELSE conference_url
				END,
				conference_provider = CASE
					WHEN conference_provider = $3 THEN NULL
					ELSE conference_provider
				END,
				google_event_id = NULL,
				google_calendar_id = NULL,
				updated_at = now()
			WHERE user_id = $1
			  AND archived_at IS NULL
			  AND google_calendar_id <> ALL($2::text[])
		`, uid, calendarIDs, model.ConferenceProviderMeet.String()); err != nil {
			return err
		}
		if _, err := r.conn(txCtx).Exec(txCtx, `
			UPDATE user_settings
			SET google_calendar_id = NULL, updated_at = now()
			WHERE user_id = $1
			  AND google_calendar_id <> ALL($2::text[])
		`, uid, calendarIDs); err != nil {
			return err
		}
		if _, err := r.conn(txCtx).Exec(txCtx, `
			DELETE FROM google_calendar_events
			WHERE user_id = $1
			  AND calendar_id <> ALL($2::text[])
		`, uid, calendarIDs); err != nil {
			return err
		}
		_, err = r.conn(txCtx).Exec(txCtx, `
			DELETE FROM google_calendar_sync_state
			WHERE user_id = $1
			  AND calendar_id <> ALL($2::text[])
		`, uid, calendarIDs)
		return err
	})
}

// DeleteGoogleEventLocal atomically removes an event from the local cache and
// clears the exact task link, including Meet conference fields.
func (r *Repository) DeleteGoogleEventLocal(ctx context.Context, userID string, ref model.GoogleEventRef) error {
	return r.WithTx(ctx, func(txCtx context.Context) error {
		if err := r.DeleteGoogleEvents(txCtx, userID, ref.CalendarID, []string{ref.EventID}); err != nil {
			return err
		}
		return r.ClearGoogleEventByRef(txCtx, userID, ref)
	})
}
