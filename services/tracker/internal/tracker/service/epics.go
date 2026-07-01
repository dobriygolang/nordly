package service

import (
	"context"
	"fmt"
	"strings"

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

type CreateEpicParams struct {
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

func (s *trackerService) CreateEpic(ctx context.Context, userID string, in CreateEpicParams) (*Epic, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: name required", model.ErrInvalidArgument)
	}
	color := strings.TrimSpace(in.Color)
	if color == "" || !validHexColor(color) {
		return nil, fmt.Errorf("%w: invalid color", model.ErrInvalidArgument)
	}
	created, err := s.repo.CreateEpic(ctx, userID, name, color)
	if err != nil {
		return nil, err
	}
	e := epicFromModel(created)
	return &e, nil
}

func epicFromModel(e *model.Epic) Epic {
	return Epic{ID: e.ID, Name: e.Name, Color: e.Color}
}

func validHexColor(color string) bool {
	c := strings.TrimPrefix(strings.TrimSpace(color), "#")
	if len(c) != 6 {
		return false
	}
	for _, ch := range c {
		if (ch < '0' || ch > '9') && (ch < 'a' || ch > 'f') && (ch < 'A' || ch > 'F') {
			return false
		}
	}
	return true
}
