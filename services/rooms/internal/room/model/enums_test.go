package model

import (
	"errors"
	"testing"
)

func TestStoredEnumsRejectUnknownValues(t *testing.T) {
	t.Parallel()

	_, err := ParseRoomType("interview")
	if !errors.Is(err, ErrInvalidState) {
		t.Fatalf("ParseRoomType(interview) err = %v", err)
	}
	_, err = ParseLanguage("rust")
	if !errors.Is(err, ErrInvalidState) {
		t.Fatalf("ParseLanguage(rust) err = %v", err)
	}
	_, err = ParseVisibility("public")
	if !errors.Is(err, ErrInvalidState) {
		t.Fatalf("ParseVisibility(public) err = %v", err)
	}
}
