package billingapi

import (
	billingrepo "github.com/dobriygolang/project-nordly/services/billing/internal/billing/repository"
	billingservice "github.com/dobriygolang/project-nordly/services/billing/internal/billing/service"
	"google.golang.org/grpc"
)

// NewRegisteredImplementation constructs handlers and registers them on the gRPC server.
func NewRegisteredImplementation(
	s *grpc.Server,
	svc billingservice.Service,
	repo *billingrepo.Repository,
	pg *billingrepo.Pool,
) *Implementation {
	impl := NewImplementation(svc, repo, pg)
	Register(s, impl)
	return impl
}
