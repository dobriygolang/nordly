package ws

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

const accessTokenSubprotocolPrefix = "access_token."

var errConflictingWSTokens = errors.New("conflicting websocket access tokens")

func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
}

func subprotocolAccessToken(r *http.Request) (token, protocol string) {
	for _, p := range websocket.Subprotocols(r) {
		if !strings.HasPrefix(p, accessTokenSubprotocolPrefix) {
			continue
		}
		tok := strings.TrimPrefix(p, accessTokenSubprotocolPrefix)
		if tok == "" {
			continue
		}
		return tok, p
	}
	return "", ""
}

// wsAccessToken reads the collab JWT from Sec-WebSocket-Protocol
// (access_token.<jwt>) or Authorization: Bearer. Query ?token= is ignored so
// access logs cannot capture credentials.
func wsAccessToken(r *http.Request) (token, subprotocol string, err error) {
	protoToken, protoName := subprotocolAccessToken(r)
	auth := bearerToken(r)
	switch {
	case protoToken != "" && auth != "":
		if protoToken != auth {
			return "", "", errConflictingWSTokens
		}
		return protoToken, protoName, nil
	case protoToken != "":
		return protoToken, protoName, nil
	case auth != "":
		return auth, "", nil
	default:
		return "", "", nil
	}
}
