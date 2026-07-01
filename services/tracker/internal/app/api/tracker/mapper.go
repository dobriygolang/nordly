package trackerapi

import (
	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func userSettingsToProto(s *model.UserSettingsView) *trackerv1.UserSettings {
	if s == nil {
		return &trackerv1.UserSettings{}
	}
	return &trackerv1.UserSettings{
		GoogleCalendarSyncEnabled: s.GoogleCalendarSyncEnabled,
		GoogleCalendarConnected:   s.GoogleCalendarConnected,
		GoogleReauthRequired:      s.GoogleReauthRequired,
		GoogleCalendarId:          s.GoogleCalendarID,
	}
}

func calendarEventToProto(ev googleadapter.CalendarEvent) *trackerv1.GoogleCalendarEvent {
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

func calendarToProto(c googleadapter.Calendar) *trackerv1.GoogleCalendarListEntry {
	return &trackerv1.GoogleCalendarListEntry{
		Id:              c.ID,
		Summary:         c.Summary,
		Primary:         c.Primary,
		Writable:        c.Writable,
		BackgroundColor: c.BackgroundColor,
	}
}
