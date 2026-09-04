package sandboxapi

import (
	"context"

	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

// RunCode executes user code in the sandbox runner.
func (i *Implementation) RunCode(ctx context.Context, req *sandboxv1.RunCodeRequest) (*sandboxv1.RunCodeResponse, error) {
	principal, err := requirePrincipal(ctx)
	if err != nil {
		return nil, err
	}
	language, err := languageFromProto(req.GetLanguage())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	run, err := i.svc.RunCode(ctx, sandboxservice.RunCodeInput{
		UserID:   principal.UserID,
		RoomID:   principal.EditorRoomID,
		Language: language,
		Code:     req.GetCode(),
		Stdin:    req.GetStdin(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	pb, err := toProtoCodeRun(run)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &sandboxv1.RunCodeResponse{Run: pb}, nil
}
