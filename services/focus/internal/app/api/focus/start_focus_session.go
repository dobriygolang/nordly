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
	startedAt, err := requireTimestamp(req.GetStartedAt())
	if err != nil {
		return nil, mapServiceError(err)
	}
	mode, err := sessionModeFromProto(req.GetMode())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	sess, err := i.service.StartFocusSession(
		ctx,
		userID,
		mode,
		req.GetPinnedTitle(),
		req.GetTaskId(),
		req.GetClientSessionId(),
		startedAt,
	)
	if err != nil {
		return nil, mapServiceError(err)
	}
	pb, err := toProtoSession(sess)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &focusv1.StartFocusSessionResponse{Session: pb}, nil
}
