package model

import "time"

type Epic struct {
	ID         string
	UserID     string
	Name       string
	Color      string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	ArchivedAt *time.Time
}

// EpicSeed is one default epic created for a user whose active epic set is empty.
type EpicSeed struct {
	Name  string
	Color string
}
