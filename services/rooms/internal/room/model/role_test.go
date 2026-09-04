package model

import (
	"errors"
	"testing"
)

func TestParseRole(t *testing.T) {
	t.Parallel()
	got, err := ParseRole("owner")
	if err != nil || got != RoleOwner {
		t.Fatalf("ParseRole(owner) = %q, %v", got, err)
	}
	_, err = ParseRole("interviewer")
	if !errors.Is(err, ErrInvalidState) {
		t.Fatalf("ParseRole(interviewer) err = %v", err)
	}
	_, err = ParseRole("nope")
	if !errors.Is(err, ErrInvalidState) {
		t.Fatalf("ParseRole(nope) err = %v", err)
	}
}
