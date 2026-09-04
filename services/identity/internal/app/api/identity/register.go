package identityapi

import (
	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	"google.golang.org/grpc"
)

// Register mounts IdentityService on the gRPC server.
func Register(s *grpc.Server, impl *Implementation) {
	identityv1.RegisterIdentityServiceServer(s, impl)
}
