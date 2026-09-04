package sandboxapi

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	"google.golang.org/grpc"
)

var protectedMethods = map[string]struct{}{
	sandboxv1.SandboxService_RunCode_FullMethodName:    {},
	sandboxv1.SandboxService_GetCodeRun_FullMethodName: {},
	sandboxv1.SandboxService_FormatCode_FullMethodName: {},
}

type roomScopedRequest interface {
	GetRoomId() string
}

// NewAuthInterceptor accepts only unrestricted user sessions or canonical
// editor-scoped tokens.
func NewAuthInterceptor(v *jwt.Validator) (grpc.UnaryServerInterceptor, error) {
	if v == nil {
		return nil, errors.New("sandbox auth interceptor: Validator is required")
	}
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if _, ok := protectedMethods[info.FullMethod]; !ok {
			return handler(ctx, req)
		}
		token := bearerTokenFromMetadata(ctx)
		if token == "" {
			return nil, unauthorized()
		}
		if claims, err := v.ParseUserSession(token); err == nil {
			if roomReq, ok := req.(roomScopedRequest); ok && roomReq.GetRoomId() != "" {
				return nil, permissionDenied("editor token required for room access")
			}
			return handler(withPrincipal(ctx, Principal{UserID: claims.UserID}), req)
		}

		roomReq, ok := req.(roomScopedRequest)
		if !ok || roomReq.GetRoomId() == "" {
			return nil, invalidArgument("roomId is required for editor access")
		}
		scope, err := jwt.ParseEditorScope("editor:" + roomReq.GetRoomId())
		if err != nil {
			return nil, invalidArgument("roomId must be a canonical UUID")
		}
		claims, err := v.ParseEditorAccess(token, scope)
		if err != nil {
			return nil, unauthorized()
		}
		return handler(withPrincipal(ctx, Principal{
			UserID:       claims.UserID,
			EditorRoomID: roomReq.GetRoomId(),
		}), req)
	}, nil
}
