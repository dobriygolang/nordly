package roomsapi

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
	"google.golang.org/grpc"
)

var protectedMethods = map[string]struct{}{
	roomsv1.RoomsService_GetRoom_FullMethodName:           {},
	roomsv1.RoomsService_CloseRoom_FullMethodName:         {},
	roomsv1.RoomsService_ShareWhiteboard_FullMethodName:   {},
	roomsv1.RoomsService_GetInitialScene_FullMethodName:   {},
	roomsv1.RoomsService_PublishWhiteboard_FullMethodName: {},
}

var userSessionMethods = map[string]struct{}{
	roomsv1.RoomsService_ShareWhiteboard_FullMethodName:   {},
	roomsv1.RoomsService_PublishWhiteboard_FullMethodName: {},
}

func NewAuthInterceptor(v *jwt.Validator) (grpc.UnaryServerInterceptor, error) {
	if v == nil {
		return nil, errors.New("rooms auth interceptor: Validator is required")
	}
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if _, ok := protectedMethods[info.FullMethod]; !ok {
			return handler(ctx, req)
		}
		token := BearerTokenFromContext(ctx)
		if token == "" {
			return nil, unauthorized()
		}

		if _, ok := userSessionMethods[info.FullMethod]; ok {
			session, err := v.ParseUserSession(token)
			if err != nil {
				return nil, unauthorized()
			}
			return handler(WithUserID(ctx, session.UserID), req)
		}

		roomReq, ok := req.(interface{ GetRoomId() string })
		if !ok || roomReq.GetRoomId() == "" {
			return nil, invalidArgument("roomId is required")
		}
		scope, err := jwt.ParseEditorScope("editor:" + roomReq.GetRoomId())
		if err != nil {
			return nil, invalidArgument("roomId must be a canonical UUID")
		}
		claims, err := v.ParseEditorAccess(token, scope)
		if err != nil {
			return nil, unauthorized()
		}
		return handler(WithUserID(ctx, claims.UserID), req)
	}, nil
}
