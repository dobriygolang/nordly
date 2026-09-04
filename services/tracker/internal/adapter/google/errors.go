package google

import (
	"errors"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"golang.org/x/oauth2"
	"google.golang.org/api/googleapi"
)

// ErrReauthRequired signals that the stored refresh token is no longer valid
// (revoked, expired, or consent withdrawn) and the user must reconnect.
var ErrReauthRequired = model.ErrGoogleReauthRequired

// classifyErr wraps token/permission failures as ErrReauthRequired so callers
// can drop the stored token and prompt the user to reconnect.
func classifyErr(err error) error {
	if err == nil {
		return nil
	}
	var re *oauth2.RetrieveError
	if errors.As(err, &re) {
		body := strings.ToLower(string(re.Body))
		if strings.Contains(body, "invalid_grant") || strings.Contains(body, "unauthorized_client") {
			return ErrReauthRequired
		}
	}
	var ge *googleapi.Error
	if errors.As(err, &ge) {
		if ge.Code == 401 {
			return ErrReauthRequired
		}
	}
	return err
}

// isGone reports a 410 response, which for incremental sync means the stored
// syncToken is stale and a full resync is required.
func isGone(err error) bool {
	var ge *googleapi.Error
	if errors.As(err, &ge) {
		return ge.Code == 410
	}
	return false
}
