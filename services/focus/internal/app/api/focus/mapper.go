package focusapi

import (
	"errors"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoSession(s *focusmodel.Session) (*focusv1.FocusSession, error) {
	if s == nil {
		return nil, errors.New("focus session is required")
	}
	mode, err := sessionModeToProto(s.Mode)
	if err != nil {
		return nil, err
	}
	out := &focusv1.FocusSession{
		Id:                 s.ID,
		Mode:               mode,
		PinnedTitle:        s.PinnedTitle,
		StartedAt:          timestamppb.New(s.StartedAt),
		SecondsFocused:     int32(s.SecondsFocused),
		PomodorosCompleted: int32(s.PomodorosCompleted),
	}
	if s.TaskID != nil {
		out.TaskId = *s.TaskID
	}
	if s.EndedAt != nil {
		out.EndedAt = timestamppb.New(*s.EndedAt)
	}
	return out, nil
}

func toProtoFocusDay(d focusmodel.FocusDay) *focusv1.FocusDay {
	return &focusv1.FocusDay{
		Date:     d.Date,
		Seconds:  int32(d.Seconds),
		Sessions: int32(d.Sessions),
	}
}

func toProtoStats(stats *focusmodel.Stats) (*focusv1.GetStatsResponse, error) {
	if stats == nil {
		return nil, errors.New("focus stats are required")
	}
	out := &focusv1.GetStatsResponse{
		CurrentStreakDays:   int32(stats.CurrentStreakDays),
		LongestStreakDays:   int32(stats.LongestStreakDays),
		TotalFocusedSeconds: int32(stats.TotalFocusedSeconds),
		Heatmap:             make([]*focusv1.FocusDay, 0, len(stats.Heatmap)),
		LastSevenDays:       make([]*focusv1.FocusDay, 0, len(stats.LastSevenDays)),
	}
	for _, day := range stats.Heatmap {
		out.Heatmap = append(out.Heatmap, toProtoFocusDay(day))
	}
	for _, day := range stats.LastSevenDays {
		out.LastSevenDays = append(out.LastSevenDays, toProtoFocusDay(day))
	}
	return out, nil
}

func mapServiceError(err error) error {
	switch {
	case focusservice.IsNotFound(err):
		return notFound("not found")
	case focusservice.IsInvalidArgument(err):
		return invalidArgument(err.Error())
	default:
		return status.Error(codes.Internal, "internal error")
	}
}
