package trackerapi

import (
	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func userSettingsToProto(s *model.UserSettingsView) *trackerv1.UserSettings {
	return &trackerv1.UserSettings{
		GoogleCalendarSyncEnabled: false,
		GoogleCalendarConnected:   s.GoogleCalendarConnected,
		GoogleReauthRequired:      s.GoogleReauthRequired,
		GoogleCalendarId:          s.GoogleCalendarID,
		ZoomConnected:             s.ZoomConnected,
		ZoomReauthRequired:        s.ZoomReauthRequired,
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

func workTaskToProto(t trackerservice.WorkTask) *trackerv1.WorkTask {
	out := &trackerv1.WorkTask{
		Id: t.ID, Status: t.Status, Kind: t.Kind, Title: t.Title,
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
	if t.GoogleEventID != "" {
		out.GoogleEventId = &t.GoogleEventID
	}
	if t.EpicID != "" {
		out.EpicId = &t.EpicID
	}
	if t.ConferenceURL != "" {
		out.ConferenceUrl = &t.ConferenceURL
	}
	if t.ConferenceProvider != "" {
		out.ConferenceProvider = &t.ConferenceProvider
	}
	return out
}

func epicToProto(e trackerservice.Epic) *trackerv1.Epic {
	return &trackerv1.Epic{Id: e.ID, Name: e.Name, Color: e.Color}
}
