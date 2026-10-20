package model

import "errors"

var (
	ErrInvalidArgument = errors.New("invalid argument")
	ErrNotFound        = errors.New("not found")
	ErrAccessDenied    = errors.New("access denied")
	// ErrTooManyNotes means ListNotes would have to drop rows. Callers that
	// treat a missing id as a deletion must fail instead of seeing a short page.
	ErrTooManyNotes = errors.New("too many notes")
)
