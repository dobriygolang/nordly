package sandboxapi

import (
	"context"

	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

// RunCode executes user code in the sandbox runner.
func (i *Implementation) RunCode(ctx context.Context, req *sandboxv1.RunCodeRequest) (*sandboxv1.RunCodeResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	run, err := i.svc.RunCode(ctx, sandboxservice.RunCodeInput{
		UserID:   userID,
		RoomID:   editorRoomIDFromContext(ctx),
		Language: req.GetLanguage(),
		Code:     req.GetCode(),
		Stdin:    req.GetStdin(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &sandboxv1.RunCodeResponse{Run: toProtoCodeRun(run)}, nil
}
