package support_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func TestNormalizeWikiLinksDedupesAndTrims(t *testing.T) {
	t.Parallel()
	got, err := support.NormalizeWikiLinks([]notesmodel.WikiLinkRef{
		{TargetNoteID: " 550e8400-e29b-41d4-a716-446655440000 ", LinkText: " Hello "},
		{TargetNoteID: "550e8400-e29b-41d4-a716-446655440001", LinkText: "hello"},
		{TargetNoteID: "550e8400-e29b-41d4-a716-446655440002", LinkText: "Other"},
	})
	require.NoError(t, err)
	require.Equal(t, []notesmodel.WikiLinkRef{
		{TargetNoteID: "550e8400-e29b-41d4-a716-446655440000", LinkText: "Hello"},
		{TargetNoteID: "550e8400-e29b-41d4-a716-446655440002", LinkText: "Other"},
	}, got)
}

func TestNormalizeWikiLinksRejectsInvalidTargetID(t *testing.T) {
	t.Parallel()
	_, err := support.NormalizeWikiLinks([]notesmodel.WikiLinkRef{
		{TargetNoteID: "not-a-uuid", LinkText: "Hello"},
	})
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func TestNormalizeWikiLinksRejectsEmptyText(t *testing.T) {
	t.Parallel()
	_, err := support.NormalizeWikiLinks([]notesmodel.WikiLinkRef{{LinkText: "  "}})
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}
