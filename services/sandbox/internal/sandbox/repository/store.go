package repository

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Store is the persistence port used by sandbox domain logic.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	Create(ctx context.Context, run *model.CodeRun) error
	Update(ctx context.Context, run *model.CodeRun) error
	GetByID(ctx context.Context, id string) (*model.CodeRun, error)
	ClaimQueuedRuns(ctx context.Context, limit int) ([]model.CodeRun, error)
}

var _ Store = (*Repository)(nil)
