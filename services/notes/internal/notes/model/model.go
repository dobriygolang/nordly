package model

import "time"

type Note struct {
	ID                  string
	UserID              string
	Title               string
	BodyMD              string
	Encrypted           bool
	Published           bool
	PublishSlug         *string
	PublishedAt         *time.Time
	PublishPasswordHash *string
	PublishExpiresAt    *time.Time
	SizeBytes           int
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type NoteSummary struct {
	ID        string
	Title     string
	UpdatedAt time.Time
	SizeBytes int
}

// WikiLinkRef is client-provided link metadata (plaintext even when body is E2EE).
type WikiLinkRef struct {
	TargetNoteID string
	LinkText     string
}

type BacklinkEntry struct {
	NoteID    string
	Title     string
	UpdatedAt time.Time
}

type PublishStatus struct {
	Published         bool
	Slug              string
	URL               string
	PublishedAt       *time.Time
	PasswordProtected bool
	ExpiresAt         *time.Time
}

type ShareToWebResult struct {
	Slug             string
	URL              string
	PublishedAt      time.Time
	AlreadyPublished bool
}

// PublishedNote is a public read-only view (no auth).
type PublishedNote struct {
	Title            string
	BodyMD           string
	PublishedAt      time.Time
	PasswordRequired bool
}

// PublishMeta is stored when sharing a note to the web.
type PublishMeta struct {
	PasswordHash  *string
	ExpiresInDays int32
	// QuotaLimit is nil for unlimited; otherwise new publishes must remain below it.
	QuotaLimit *int
}

// PublishedNoteRecord includes fields needed for password verification (service layer only).
type PublishedNoteRecord struct {
	Title        string
	BodyMD       string
	PublishedAt  time.Time
	PasswordHash *string
}
