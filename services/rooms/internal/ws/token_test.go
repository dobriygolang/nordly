package ws

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWsAccessTokenIgnoresQuery(t *testing.T) {
	t.Parallel()

	req := httptestRequest("/ws/editor/room?token=query-secret")
	token, proto, err := wsAccessToken(req)
	require.NoError(t, err)
	require.Empty(t, token)
	require.Empty(t, proto)
}

func TestWsAccessTokenBearer(t *testing.T) {
	t.Parallel()

	req := httptestRequest("/ws/editor/room")
	req.Header.Set("Authorization", "Bearer user-jwt")
	token, proto, err := wsAccessToken(req)
	require.NoError(t, err)
	require.Equal(t, "user-jwt", token)
	require.Empty(t, proto)
}

func TestWsAccessTokenSubprotocol(t *testing.T) {
	t.Parallel()

	req := httptestRequest("/ws/editor/room")
	req.Header.Set("Sec-WebSocket-Protocol", "access_token.eyJ.sub")
	token, proto, err := wsAccessToken(req)
	require.NoError(t, err)
	require.Equal(t, "eyJ.sub", token)
	require.Equal(t, "access_token.eyJ.sub", proto)
}

func TestWsAccessTokenConflict(t *testing.T) {
	t.Parallel()

	req := httptestRequest("/ws/editor/room")
	req.Header.Set("Authorization", "Bearer one")
	req.Header.Set("Sec-WebSocket-Protocol", "access_token.two")
	_, _, err := wsAccessToken(req)
	require.ErrorIs(t, err, errConflictingWSTokens)
}

func httptestRequest(target string) *http.Request {
	req, err := http.NewRequest(http.MethodGet, target, nil)
	if err != nil {
		panic(err)
	}
	return req
}
