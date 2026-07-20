package notesapi

import (
	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

// Implementation implements NotesService gRPC handlers.
type Implementation struct {
	notesv1.UnimplementedNotesServiceServer
	service notesservice.Service
}

// NewImplementation constructs the gRPC transport layer.
func NewImplementation(svc notesservice.Service) *Implementation {
	return &Implementation{service: svc}
}
