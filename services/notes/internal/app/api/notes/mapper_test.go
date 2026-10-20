package notesapi

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMapServiceErrorUsesPermissionDeniedForWrongPassword(t *testing.T) {
	t.Parallel()

	require.Equal(t, codes.PermissionDenied, status.Code(mapServiceError(notesmodel.ErrAccessDenied)))
}

func TestMapServiceErrorRejectsTruncatedNoteList(t *testing.T) {
	t.Parallel()

	mapped := mapServiceError(notesmodel.ErrTooManyNotes)
	require.Equal(t, codes.ResourceExhausted, status.Code(mapped))
	require.Equal(t, "too many notes", status.Convert(mapped).Message())
}

func TestMapServiceErrorHidesMalformedStoredPasswordHash(t *testing.T) {
	t.Parallel()

	err := errors.New("verify published note password hash: malformed")
	mapped := mapServiceError(err)
	require.Equal(t, codes.Internal, status.Code(mapped))
	require.Equal(t, "internal error", status.Convert(mapped).Message())
}
