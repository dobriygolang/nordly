package identityapi

import (
	"net/http"
)

// PublicKeyHTTP serves the RS256 JWT public key for other services and clients.
func PublicKeyHTTP(publicKeyPEM []byte) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if len(publicKeyPEM) == 0 {
			http.Error(w, "public key not configured", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/x-pem-file")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusOK)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(publicKeyPEM)
	}
}
