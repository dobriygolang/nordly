package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) InitVault(ctx context.Context, _ *notesv1.InitVaultRequest) (*notesv1.InitVaultResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	salt, initialized, err := i.service.InitVault(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.InitVaultResponse{SaltB64: salt, Initialized: initialized}, nil
}
