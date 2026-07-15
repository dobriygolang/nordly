package sandboxapi

import (
	"context"

	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

// FormatCode applies language formatters (gofmt for Go) to user code.
func (i *Implementation) FormatCode(ctx context.Context, req *sandboxv1.FormatCodeRequest) (*sandboxv1.FormatCodeResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	code, err := i.svc.FormatCode(ctx, sandboxservice.FormatCodeInput{
		UserID:   userID,
		RoomID:   editorRoomIDFromContext(ctx),
		Language: req.GetLanguage(),
		Code:     req.GetCode(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &sandboxv1.FormatCodeResponse{Code: code}, nil
}
