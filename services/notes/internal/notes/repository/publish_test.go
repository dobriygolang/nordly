package repository

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

func TestValidatePublishMeta(t *testing.T) {
	t.Parallel()
	hash := "hash"
	emptyHash := ""
	tests := []struct {
		name     string
		meta     notesmodel.PublishMeta
		wantDays int
		wantErr  bool
	}{
		{
			name: "public never",
			meta: notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
			},
		},
		{
			name: "password seven days",
			meta: notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicySevenDays,
				NewPasswordHash: &hash,
			},
			wantDays: 7,
		},
		{
			name: "public expiry",
			meta: notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicySevenDays,
			},
			wantErr: true,
		},
		{
			name: "public hash",
			meta: notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
				NewPasswordHash: &hash,
			},
			wantErr: true,
		},
		{
			name: "empty hash",
			meta: notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
				NewPasswordHash: &emptyHash,
			},
			wantErr: true,
		},
		{name: "unspecified", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			days, err := validatePublishMeta(tt.meta)
			if tt.wantErr {
				require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tt.wantDays, days)
		})
	}
}

func TestNewPublishSlugUsesOpaqueUUIDForPasswordAccess(t *testing.T) {
	t.Parallel()

	slug := newPublishSlug("Readable title", true)
	_, err := uuid.Parse(slug)
	require.NoError(t, err)
}
