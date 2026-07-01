package google

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/option"
)

// CalendarEvent is a normalized Google Calendar event for the tracker API.
type CalendarEvent struct {
	ID         string
	CalendarID string
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	HTMLLink   string
	Editable   bool
}

// EventInput describes a create/update payload for a calendar event.
type EventInput struct {
	Title  string
	Start  time.Time
	End    time.Time
	AllDay bool
}

// Calendar is a normalized entry from the user's calendar list.
type Calendar struct {
	ID              string
	Summary         string
	Primary         bool
	Writable        bool
	BackgroundColor string
}

// SyncResult is the delta returned by an incremental events sync.
type SyncResult struct {
	Upserts       []CalendarEvent
	DeletedIDs    []string
	NextSyncToken string
	FullResync    bool // caller must clear its cache + syncToken and retry from scratch
}

func normalizeCalendarID(id string) string {
	if strings.TrimSpace(id) == "" {
		return "primary"
	}
	return id
}

func (c *Client) service(ctx context.Context, refreshToken string) (*calendar.Service, error) {
	svc, err := calendar.NewService(ctx, option.WithTokenSource(c.TokenSource(ctx, refreshToken)))
	if err != nil {
		return nil, fmt.Errorf("calendar service: %w", err)
	}
	return svc, nil
}

func toEventDateTimes(in EventInput) (start, end *calendar.EventDateTime) {
	if in.AllDay {
		endDate := in.End
		if !endDate.After(in.Start) {
			endDate = in.Start.Add(24 * time.Hour)
		}
		return &calendar.EventDateTime{Date: in.Start.Format("2006-01-02")},
			&calendar.EventDateTime{Date: endDate.Format("2006-01-02")}
	}
	endTime := in.End
	if !endTime.After(in.Start) {
		endTime = in.Start.Add(time.Hour)
	}
	return &calendar.EventDateTime{DateTime: in.Start.UTC().Format(time.RFC3339), TimeZone: "UTC"},
		&calendar.EventDateTime{DateTime: endTime.UTC().Format(time.RFC3339), TimeZone: "UTC"}
}

// CreateEvent inserts a new event and returns the normalized result.
func (c *Client) CreateEvent(ctx context.Context, refreshToken, calendarID string, in EventInput) (CalendarEvent, error) {
	if !c.Configured() {
		return CalendarEvent{}, fmt.Errorf("google calendar not configured")
	}
	svc, err := c.service(ctx, refreshToken)
	if err != nil {
		return CalendarEvent{}, err
	}
	cid := normalizeCalendarID(calendarID)
	start, end := toEventDateTimes(in)
	created, err := svc.Events.Insert(cid, &calendar.Event{Summary: in.Title, Start: start, End: end}).Context(ctx).Do()
	if err != nil {
		return CalendarEvent{}, classifyErr(fmt.Errorf("create calendar event: %w", err))
	}
	ev, _ := calendarEventFromAPI(created, cid)
	return ev, nil
}

// UpdateEvent patches an existing event's title and time window.
func (c *Client) UpdateEvent(ctx context.Context, refreshToken, calendarID, eventID string, in EventInput) (CalendarEvent, error) {
	if !c.Configured() {
		return CalendarEvent{}, fmt.Errorf("google calendar not configured")
	}
	svc, err := c.service(ctx, refreshToken)
	if err != nil {
		return CalendarEvent{}, err
	}
	cid := normalizeCalendarID(calendarID)
	start, end := toEventDateTimes(in)
	updated, err := svc.Events.Patch(cid, eventID, &calendar.Event{Summary: in.Title, Start: start, End: end}).Context(ctx).Do()
	if err != nil {
		return CalendarEvent{}, classifyErr(fmt.Errorf("update calendar event: %w", err))
	}
	ev, _ := calendarEventFromAPI(updated, cid)
	return ev, nil
}

// DeleteEvent removes a calendar event; already-deleted events are treated as success.
func (c *Client) DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error {
	if !c.Configured() || eventID == "" {
		return nil
	}
	svc, err := c.service(ctx, refreshToken)
	if err != nil {
		return err
	}
	if err := svc.Events.Delete(normalizeCalendarID(calendarID), eventID).Context(ctx).Do(); err != nil {
		var ge *googleapi.Error
		if errors.As(err, &ge) && (ge.Code == 404 || ge.Code == 410) {
			return nil
		}
		return classifyErr(fmt.Errorf("delete calendar event: %w", err))
	}
	return nil
}

// ListCalendars returns the user's calendar list entries.
func (c *Client) ListCalendars(ctx context.Context, refreshToken string) ([]Calendar, error) {
	if !c.Configured() {
		return nil, fmt.Errorf("google calendar not configured")
	}
	svc, err := c.service(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	resp, err := svc.CalendarList.List().Context(ctx).Do()
	if err != nil {
		return nil, classifyErr(fmt.Errorf("list calendars: %w", err))
	}
	out := make([]Calendar, 0, len(resp.Items))
	for _, it := range resp.Items {
		if it == nil {
			continue
		}
		out = append(out, Calendar{
			ID:              it.Id,
			Summary:         it.Summary,
			Primary:         it.Primary,
			Writable:        it.AccessRole == "owner" || it.AccessRole == "writer",
			BackgroundColor: it.BackgroundColor,
		})
	}
	return out, nil
}

// SyncEvents performs an incremental (or, with an empty syncToken, a windowed
// full) sync and returns the changes since the last token.
func (c *Client) SyncEvents(
	ctx context.Context,
	refreshToken, calendarID, syncToken string,
	timeMin, timeMax time.Time,
) (SyncResult, error) {
	if !c.Configured() {
		return SyncResult{}, fmt.Errorf("google calendar not configured")
	}
	svc, err := c.service(ctx, refreshToken)
	if err != nil {
		return SyncResult{}, err
	}
	cid := normalizeCalendarID(calendarID)
	var res SyncResult
	pageToken := ""
	for {
		call := svc.Events.List(cid).Context(ctx).ShowDeleted(true).SingleEvents(true).MaxResults(2500)
		if syncToken != "" {
			call = call.SyncToken(syncToken)
		} else {
			if !timeMin.IsZero() {
				call = call.TimeMin(timeMin.UTC().Format(time.RFC3339))
			}
			if !timeMax.IsZero() {
				call = call.TimeMax(timeMax.UTC().Format(time.RFC3339))
			}
		}
		if pageToken != "" {
			call = call.PageToken(pageToken)
		}
		resp, err := call.Do()
		if err != nil {
			if isGone(err) {
				return SyncResult{FullResync: true}, nil
			}
			return SyncResult{}, classifyErr(fmt.Errorf("sync calendar events: %w", err))
		}
		for _, item := range resp.Items {
			if item == nil {
				continue
			}
			if item.Status == "cancelled" {
				res.DeletedIDs = append(res.DeletedIDs, item.Id)
				continue
			}
			ev, ok := calendarEventFromAPI(item, cid)
			if !ok {
				continue
			}
			res.Upserts = append(res.Upserts, ev)
		}
		if resp.NextPageToken != "" {
			pageToken = resp.NextPageToken
			continue
		}
		res.NextSyncToken = resp.NextSyncToken
		break
	}
	return res, nil
}

func calendarEventFromAPI(item *calendar.Event, calendarID string) (CalendarEvent, bool) {
	title := strings.TrimSpace(item.Summary)
	if title == "" {
		title = "(No title)"
	}
	editable := true
	if item.Organizer != nil && !item.Organizer.Self && !item.GuestsCanModify {
		editable = false
	}
	base := CalendarEvent{
		ID:         item.Id,
		CalendarID: calendarID,
		Title:      title,
		HTMLLink:   item.HtmlLink,
		Editable:   editable,
	}
	if item.Start != nil && item.Start.Date != "" {
		start, err := time.Parse("2006-01-02", item.Start.Date)
		if err != nil {
			return CalendarEvent{}, false
		}
		end := start.Add(24 * time.Hour)
		if item.End != nil && item.End.Date != "" {
			if parsed, err := time.Parse("2006-01-02", item.End.Date); err == nil {
				end = parsed
			}
		}
		base.Start, base.End, base.AllDay = start, end, true
		return base, true
	}
	if item.Start == nil || item.Start.DateTime == "" {
		return CalendarEvent{}, false
	}
	start, err := time.Parse(time.RFC3339, item.Start.DateTime)
	if err != nil {
		return CalendarEvent{}, false
	}
	end := start.Add(time.Hour)
	if item.End != nil && item.End.DateTime != "" {
		if parsed, err := time.Parse(time.RFC3339, item.End.DateTime); err == nil {
			end = parsed
		}
	}
	base.Start, base.End, base.AllDay = start, end, false
	return base, true
}
