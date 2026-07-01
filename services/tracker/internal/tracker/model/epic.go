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
