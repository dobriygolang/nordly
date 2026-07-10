package sandboxapi

import (
	"context"

	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"google.golang.org/grpc"
)

var protectedMethods = map[string]struct{}{
	sandboxv1.SandboxService_RunCode_FullMethodName:    {},
	sandboxv1.SandboxService_GetCodeRun_FullMethodName: {},
	sandboxv1.SandboxService_FormatCode_FullMethodName: {},
}

// AuthInterceptor validates Bearer JWT for user-facing RPC methods.
func AuthInterceptor(v *jwt.Validator) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if _, ok := protectedMethods[info.FullMethod]; !ok {
			return handler(ctx, req)
		}
		token := BearerTokenFromContext(ctx)
		claims, err := v.ParseScoped(token, "")
		if err != nil {
			return nil, unauthorized()
		}
		ctx = WithUserID(ctx, claims.UserID)
		ctx = WithBearerToken(ctx, token)
		ctx = WithTokenScope(ctx, claims.Scope)
		return handler(ctx, req)
	}
}
