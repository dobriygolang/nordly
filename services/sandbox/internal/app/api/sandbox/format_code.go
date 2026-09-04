package sandboxapi

import (
	"context"

	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

// FormatCode applies language formatters (gofmt for Go) to user code.
func (i *Implementation) FormatCode(ctx context.Context, req *sandboxv1.FormatCodeRequest) (*sandboxv1.FormatCodeResponse, error) {
	principal, err := requirePrincipal(ctx)
	if err != nil {
		return nil, err
	}
	language, err := languageFromProto(req.GetLanguage())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	code, err := i.svc.FormatCode(ctx, sandboxservice.FormatCodeInput{
		UserID:   principal.UserID,
		Language: language,
		Code:     req.GetCode(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &sandboxv1.FormatCodeResponse{Code: code}, nil
}
