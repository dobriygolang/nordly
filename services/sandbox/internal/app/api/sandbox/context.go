package sandboxapi

import (
	"context"
	"strings"

	"google.golang.org/grpc/metadata"
)

type ctxKey int

const principalKey ctxKey = 1

// Principal is the strictly classified caller identity.
type Principal struct {
	UserID       string
	EditorRoomID string
}

func withPrincipal(ctx context.Context, principal Principal) context.Context {
	return context.WithValue(ctx, principalKey, principal)
}

func principalFromContext(ctx context.Context) (Principal, bool) {
	principal, ok := ctx.Value(principalKey).(Principal)
	return principal, ok && principal.UserID != ""
}

func bearerTokenFromMetadata(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	values := md.Get("authorization")
	if len(values) != 1 {
		return ""
	}
	value := strings.TrimSpace(values[0])
	if len(value) < 8 || !strings.EqualFold(value[:7], "bearer ") {
		return ""
	}
	token := strings.TrimSpace(value[7:])
	if token == "" || strings.ContainsAny(token, " \t\r\n") {
		return ""
	}
	return token
}

func requirePrincipal(ctx context.Context) (Principal, error) {
	principal, ok := principalFromContext(ctx)
	if !ok {
		return Principal{}, unauthorized()
	}
	return principal, nil
}
