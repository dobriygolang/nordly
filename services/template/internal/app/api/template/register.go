package templateapi

import (
	templatev1 "github.com/dobriygolang/project-nordly/services/template/pkg/api/template/v1"
	exampleservice "github.com/dobriygolang/project-nordly/services/template/internal/example/service"
	"google.golang.org/grpc"
)

// Register mounts TemplateService on the gRPC server.
func Register(s *grpc.Server, impl *Implementation) {
	templatev1.RegisterTemplateServiceServer(s, impl)
}

// NewRegisteredImplementation constructs handlers and registers them on the gRPC server.
func NewRegisteredImplementation(s *grpc.Server, svc exampleservice.Service) *Implementation {
	impl := NewImplementation(svc)
	Register(s, impl)
	return impl
}
