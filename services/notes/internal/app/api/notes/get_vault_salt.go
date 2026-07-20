package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetVaultSalt(ctx context.Context, _ *notesv1.GetVaultSaltRequest) (*notesv1.GetVaultSaltResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	salt, err := i.service.GetVaultSalt(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetVaultSaltResponse{SaltB64: salt, Initialized: true}, nil
}
