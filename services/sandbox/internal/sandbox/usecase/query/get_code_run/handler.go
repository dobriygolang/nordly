package get_code_run

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store loads a code run by id.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetByID(ctx context.Context, id string) (*model.CodeRun, error)
}

// Handler returns a sanitized code run when the caller may read it.
type Handler struct {
	store Store
}

// New constructs the get-code-run query handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("get_code_run: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) (*model.CodeRun, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	run, err := h.store.GetByID(ctx, q.RunID)
	if err != nil {
		return nil, err
	}
	if run == nil {
		return nil, fmt.Errorf("get_code_run: store returned nil run")
	}
	if !support.CanReadCodeRun(run, q.UserID, q.EditorRoomID) {
		return nil, model.ErrForbidden
	}
	return support.SanitizeRunResponse(run), nil
}
