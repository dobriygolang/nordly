package zoom

import (
	"errors"
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
	"golang.org/x/oauth2"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

func TestClassifyErrDistinguishesReauthFromTransientTokenFailure(t *testing.T) {
	t.Parallel()
	reauth := classifyErr(&oauth2.RetrieveError{
		Response: &http.Response{StatusCode: http.StatusBadRequest},
		Body:     []byte(`{"error":"invalid_grant"}`),
	})
	require.ErrorIs(t, reauth, model.ErrZoomReauthRequired)

	transient := &oauth2.RetrieveError{
		Response: &http.Response{StatusCode: http.StatusInternalServerError},
		Body:     []byte(`{"error":"server_error"}`),
	}
	require.Same(t, transient, classifyErr(transient))
	require.False(t, errors.Is(classifyErr(transient), model.ErrZoomReauthRequired))
}
