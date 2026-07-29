package get_code_run

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store loads a code run by id.
type Store interface {
	GetByID(ctx context.Context, id string) (*model.CodeRun, error)
}

// Handler returns a sanitized code run when the caller may read it.
type Handler struct {
	store Store
}

// New constructs the get-code-run query handler.
func New(store Store) *Handler {
	if store == nil {
		panic("get_code_run: Store is required")
	}
	return &Handler{store: store}
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
	if !support.CanReadCodeRun(run, q.UserID, q.Scope) {
		return nil, model.ErrForbidden
	}
	return support.SanitizeRunResponse(run), nil
}
