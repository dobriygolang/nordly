package templateapi

import (
	exampleservice "github.com/dobriygolang/project-nordly/services/template/internal/example/service"
	templatev1 "github.com/dobriygolang/project-nordly/services/template/pkg/api/template/v1"
)

// Implementation implements TemplateService gRPC handlers.
type Implementation struct {
	templatev1.UnimplementedTemplateServiceServer
	service exampleservice.Service
}

// NewImplementation constructs the gRPC transport layer.
func NewImplementation(svc exampleservice.Service) *Implementation {
	return &Implementation{service: svc}
}
