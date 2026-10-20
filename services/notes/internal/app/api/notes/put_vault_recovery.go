package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) PutVaultRecovery(ctx context.Context, req *notesv1.PutVaultRecoveryRequest) (*notesv1.PutVaultRecoveryResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.PutVaultRecovery(ctx, userID, req.GetWrapB64(), req.GetSaltB64()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.PutVaultRecoveryResponse{}, nil
}
