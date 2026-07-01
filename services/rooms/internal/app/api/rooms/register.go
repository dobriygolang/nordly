package roomsapi

import (
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
	roomservice "github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/ws"
	"google.golang.org/grpc"
)

func Register(s *grpc.Server, impl *Implementation) {
	roomsv1.RegisterRoomsServiceServer(s, impl)
}

func NewRegisteredImplementation(s *grpc.Server, svc roomservice.Service, hub *ws.Hub) *Implementation {
	impl := NewImplementation(svc, hub)
	Register(s, impl)
	return impl
}
