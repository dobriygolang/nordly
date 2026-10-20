package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetVaultRecovery(ctx context.Context, _ *notesv1.GetVaultRecoveryRequest) (*notesv1.GetVaultRecoveryResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	wrap, salt, err := i.service.GetVaultRecovery(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetVaultRecoveryResponse{WrapB64: wrap, SaltB64: salt}, nil
}
