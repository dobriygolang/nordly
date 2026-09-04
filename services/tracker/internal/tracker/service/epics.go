package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_epics"
)

func (s *trackerService) ListEpics(ctx context.Context, userID string) ([]model.Epic, error) {
	return s.listEpics.Handle(ctx, list_epics.Query{UserID: userID})
}
