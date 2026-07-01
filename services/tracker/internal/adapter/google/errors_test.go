package google

import (
	"errors"
	"fmt"
	"testing"

	"golang.org/x/oauth2"
	"google.golang.org/api/googleapi"
)

func TestClassifyErrInvalidGrant(t *testing.T) {
	re := &oauth2.RetrieveError{Body: []byte(`{"error":"invalid_grant"}`)}
	got := classifyErr(fmt.Errorf("refresh: %w", re))
	if !errors.Is(got, ErrReauthRequired) {
		t.Fatalf("invalid_grant should map to ErrReauthRequired, got %v", got)
	}
}

func TestClassifyErrUnauthorized(t *testing.T) {
	ge := &googleapi.Error{Code: 401}
	got := classifyErr(fmt.Errorf("list: %w", ge))
	if !errors.Is(got, ErrReauthRequired) {
		t.Fatalf("401 should map to ErrReauthRequired, got %v", got)
	}
}

func TestClassifyErrOtherPassthrough(t *testing.T) {
	base := errors.New("network blip")
	got := classifyErr(base)
	if errors.Is(got, ErrReauthRequired) {
		t.Fatal("generic error must not map to ErrReauthRequired")
	}
	if !errors.Is(got, base) {
		t.Fatal("generic error must be preserved")
	}
}

func TestIsGone(t *testing.T) {
	if !isGone(fmt.Errorf("sync: %w", &googleapi.Error{Code: 410})) {
		t.Fatal("410 should be detected as gone")
	}
	if isGone(&googleapi.Error{Code: 500}) {
		t.Fatal("500 is not gone")
	}
}
