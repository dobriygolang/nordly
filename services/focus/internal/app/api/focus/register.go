package focusapi

import (
	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
	"google.golang.org/grpc"
)

// Register mounts FocusService on the gRPC server.
func Register(s *grpc.Server, impl *Implementation) {
	focusv1.RegisterFocusServiceServer(s, impl)
}

// NewRegisteredImplementation constructs handlers and registers them on the gRPC server.
func NewRegisteredImplementation(s *grpc.Server, svc focusservice.Service) *Implementation {
	impl := NewImplementation(svc)
	Register(s, impl)
	return impl
}
