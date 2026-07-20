package focusapi

import (
	"context"

	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
)

func (i *Implementation) EndFocusSession(
	ctx context.Context,
	req *focusv1.EndFocusSessionRequest,
) (*focusv1.EndFocusSessionResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	endedAt, err := requireTimestamp(req.GetEndedAt())
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
