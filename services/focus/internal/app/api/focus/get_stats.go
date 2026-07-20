package focusapi

import (
	"context"

	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
)

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
