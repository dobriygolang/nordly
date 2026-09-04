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
	out, err := toProtoStats(stats)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return out, nil
}
