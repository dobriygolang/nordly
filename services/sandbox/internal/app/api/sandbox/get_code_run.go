package sandboxapi

import (
	"context"

	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

// GetCodeRun returns a persisted code run for the authenticated user.
func (i *Implementation) GetCodeRun(ctx context.Context, req *sandboxv1.GetCodeRunRequest) (*sandboxv1.GetCodeRunResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	run, err := i.svc.GetCodeRun(ctx, sandboxservice.GetCodeRunInput{
		UserID: userID,
		Scope:  TokenScopeFromContext(ctx),
		RunID:  req.GetId(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &sandboxv1.GetCodeRunResponse{Run: toProtoCodeRun(run)}, nil
}
