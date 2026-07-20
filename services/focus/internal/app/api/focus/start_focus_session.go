package focusapi

import (
	"context"

	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
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
