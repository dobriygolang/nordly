package roomsapi

import (
	"context"
	"fmt"

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

func AuthInterceptor(v *jwt.Validator) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		if _, ok := protectedMethods[info.FullMethod]; !ok {
			return handler(ctx, req)
		}
		token := BearerTokenFromContext(ctx)
		expectedScope := ""
		if roomReq, ok := req.(interface{ GetRoomId() string }); ok {
			roomID := roomReq.GetRoomId()
			if roomID == "" {
				return nil, invalidArgument("roomId is required")
			}
			expectedScope = fmt.Sprintf("editor:%s", roomID)
		}
		claims, err := v.ParseScoped(token, "")
		if err != nil {
			return nil, unauthorized()
		}
		if expectedScope != "" && claims.Scope != expectedScope {
			return nil, permissionDenied("room scope does not grant access")
		}
		return handler(WithUserID(ctx, claims.UserID), req)
	}
}
