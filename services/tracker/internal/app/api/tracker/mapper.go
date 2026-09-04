package trackerapi

import (
	"errors"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func userSettingsToProto(s *model.UserSettingsView) *trackerv1.UserSettings {
	return &trackerv1.UserSettings{
		GoogleCalendarConnected: s.GoogleCalendarConnected,
		GoogleReauthRequired:    s.GoogleReauthRequired,
		GoogleCalendarId:        s.GoogleCalendarID,
		ZoomConnected:           s.ZoomConnected,
		ZoomReauthRequired:      s.ZoomReauthRequired,
	}
}

func calendarEventToProto(ev model.CalendarEvent) *trackerv1.GoogleCalendarEvent {
	return &trackerv1.GoogleCalendarEvent{
		Id:         ev.ID,
		Title:      ev.Title,
		Start:      timestamppb.New(ev.Start),
		End:        timestamppb.New(ev.End),
		AllDay:     ev.AllDay,
		CalendarId: ev.CalendarID,
		HtmlLink:   ev.HTMLLink,
		Editable:   ev.Editable,
	}
}

func calendarToProto(c model.Calendar) *trackerv1.GoogleCalendarListEntry {
	return &trackerv1.GoogleCalendarListEntry{
		Id:              c.ID,
		Summary:         c.Summary,
		Primary:         c.Primary,
		Writable:        c.Writable,
		BackgroundColor: c.BackgroundColor,
	}
}

func workTaskToProto(t model.WorkTask) (*trackerv1.WorkTask, error) {
	hasGoogleEvent := t.GoogleEventID != nil && strings.TrimSpace(*t.GoogleEventID) != ""
	hasGoogleCalendar := t.GoogleCalendarID != nil && strings.TrimSpace(*t.GoogleCalendarID) != ""
	hasZoomMeeting := t.ZoomMeetingID != nil && strings.TrimSpace(*t.ZoomMeetingID) != ""
	if hasGoogleEvent != hasGoogleCalendar {
		return nil, errors.New("work task has incomplete google event reference")
	}
	if hasGoogleEvent && hasZoomMeeting {
		return nil, errors.New("work task has conflicting conference references")
	}
	status, err := workStatusToProto(t.Status)
	if err != nil {
		return nil, err
	}
	kind, err := workKindToProto(t.Kind)
	if err != nil {
		return nil, err
	}
	out := &trackerv1.WorkTask{
		Id: t.ID, Status: status, Kind: kind, Title: t.Title,
		CreatedAt: timestamppb.New(t.CreatedAt), UpdatedAt: timestamppb.New(t.UpdatedAt),
	}
	if t.CompletedAt != nil {
		out.CompletedAt = timestamppb.New(*t.CompletedAt)
	}
	if t.ScheduledStart != nil {
		out.ScheduledStart = timestamppb.New(*t.ScheduledStart)
	}
	if t.ScheduledDurationMin != nil {
		v := int32(*t.ScheduledDurationMin)
		out.ScheduledDurationMin = &v
	}
	if hasGoogleEvent {
		out.GoogleEventId = t.GoogleEventID
	}
	if hasGoogleCalendar {
		out.GoogleCalendarId = t.GoogleCalendarID
	}
	if t.EpicID != nil && *t.EpicID != "" {
		out.EpicId = t.EpicID
	}
	if t.ConferenceURL != nil && *t.ConferenceURL != "" {
		out.ConferenceUrl = t.ConferenceURL
	}
	if t.ConferenceProvider != nil {
		provider, err := conferenceProviderToProto(*t.ConferenceProvider)
		if err != nil {
			return nil, err
		}
		out.ConferenceProvider = &provider
	}
	if hasZoomMeeting {
		out.ZoomMeetingId = t.ZoomMeetingID
	}
	return out, nil
}

func epicToProto(e model.Epic) *trackerv1.Epic {
	return &trackerv1.Epic{Id: e.ID, Name: e.Name, Color: e.Color}
}
