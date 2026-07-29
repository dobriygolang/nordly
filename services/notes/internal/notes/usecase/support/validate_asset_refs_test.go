package support_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func TestValidateAssetRefs_acceptsMatchedUUIDs(t *testing.T) {
	t.Parallel()
	id := "11111111-1111-1111-1111-111111111111"
	err := support.ValidateAssetRefs(
		"hello ![pic](nordly-asset:"+id+") world",
		[]notesmodel.PublishedAttachment{{ID: id}},
	)
	require.NoError(t, err)
}

func TestValidateAssetRefs_rejectsMissingAttachment(t *testing.T) {
	t.Parallel()
	err := support.ValidateAssetRefs(
		"![pic](nordly-asset:11111111-1111-1111-1111-111111111111)",
		nil,
	)
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func TestValidateAssetRefs_rejectsMalformedScheme(t *testing.T) {
	t.Parallel()
	err := support.ValidateAssetRefs("![pic](nordly-asset:not-a-uuid)", nil)
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}
