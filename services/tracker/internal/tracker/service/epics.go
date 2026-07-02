package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

var defaultEpics = []struct {
	Name  string
	Color string
}{
	{Name: "Work", Color: "#5b8def"},
	{Name: "Personal", Color: "#4cb35c"},
	{Name: "Learning", Color: "#c084fc"},
	{Name: "Health", Color: "#f59e0b"},
}

type Epic struct {
	ID    string
	Name  string
	Color string
}

func (s *trackerService) ListEpics(ctx context.Context, userID string) ([]Epic, error) {
	epics, err := s.repo.ListEpicsByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if len(epics) == 0 {
		for _, d := range defaultEpics {
			created, cerr := s.repo.CreateEpic(ctx, userID, d.Name, d.Color)
			if cerr != nil {
				return nil, cerr
			}
			epics = append(epics, *created)
		}
	}
	out := make([]Epic, 0, len(epics))
	for _, e := range epics {
		out = append(out, epicFromModel(&e))
	}
	return out, nil
}

func epicFromModel(e *model.Epic) Epic {
	return Epic{ID: e.ID, Name: e.Name, Color: e.Color}
}
