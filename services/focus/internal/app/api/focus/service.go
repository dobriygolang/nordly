package focusapi

import (
	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
)

// Implementation implements FocusService gRPC handlers.
type Implementation struct {
	focusv1.UnimplementedFocusServiceServer
	service focusservice.Service
}

// NewImplementation constructs the gRPC transport layer.
func NewImplementation(svc focusservice.Service) *Implementation {
	return &Implementation{service: svc}
}
