package sandboxapi

import (
	sandboxservice "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/service"
	"google.golang.org/grpc"
)

// NewRegisteredImplementation constructs handlers and registers them on the gRPC server.
func NewRegisteredImplementation(s *grpc.Server, svc sandboxservice.Service) *Implementation {
	impl := NewImplementation(svc)
	Register(s, impl)
	return impl
}
