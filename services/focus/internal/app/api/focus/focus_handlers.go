package focusapi

import (
	"context"
	"time"

	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (i *Implementation) StartFocusSession(
	ctx context.Context,
	req *focusv1.StartFocusSessionRequest,
) (*focusv1.StartFocusSessionResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	startedAt, err := validTimestamp(req.GetStartedAt())
	if err != nil {
		return nil, mapServiceError(err)
	}
	sess, err := i.service.StartFocusSession(
		ctx,
		userID,
		req.GetMode(),
		req.GetPinnedTitle(),
		req.GetTaskId(),
		req.GetClientSessionId(),
		startedAt,
	)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &focusv1.StartFocusSessionResponse{Session: toProtoSession(sess)}, nil
}

func (i *Implementation) EndFocusSession(
	ctx context.Context,
	req *focusv1.EndFocusSessionRequest,
) (*focusv1.EndFocusSessionResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	endedAt, err := validTimestamp(req.GetEndedAt())
	if err != nil {
		return nil, mapServiceError(err)
	}
	sess, err := i.service.EndFocusSession(
		ctx,
		userID,
		req.GetSessionId(),
		int(req.GetSecondsFocused()),
		int(req.GetPomodorosCompleted()),
		endedAt,
	)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &focusv1.EndFocusSessionResponse{Session: toProtoSession(sess)}, nil
}

func (i *Implementation) GetStats(
	ctx context.Context,
	req *focusv1.GetStatsRequest,
) (*focusv1.GetStatsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	stats, err := i.service.GetStats(ctx, userID, req.GetUpToDate())
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &focusv1.GetStatsResponse{
		CurrentStreakDays:   int32(stats.CurrentStreakDays),
		LongestStreakDays:   int32(stats.LongestStreakDays),
		TotalFocusedSeconds: int32(stats.TotalFocusedSeconds),
	}
	for _, d := range stats.Heatmap {
		out.Heatmap = append(out.Heatmap, toProtoFocusDay(d))
	}
	for _, d := range stats.LastSevenDays {
		out.LastSevenDays = append(out.LastSevenDays, toProtoFocusDay(d))
	}
	return out, nil
}

func validTimestamp(value *timestamppb.Timestamp) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}
	if err := value.CheckValid(); err != nil {
		return nil, focusservice.ErrInvalidArgument
	}
	parsed := value.AsTime()
	return &parsed, nil
}
