package model

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

type RoomType string

const (
	RoomTypePractice     RoomType = "practice"
	RoomTypeSystemDesign RoomType = "system_design"
)

func (t RoomType) IsValid() bool {
	switch t {
	case RoomTypePractice, RoomTypeSystemDesign:
		return true
	}
	return false
}

func (t RoomType) String() string { return string(t) }

func ParseRoomType(value string) (RoomType, error) {
	roomType := RoomType(value)
	if !roomType.IsValid() {
		return "", fmt.Errorf("%w: invalid room type %q", ErrInvalidState, value)
	}
	return roomType, nil
}

type Visibility string

const (
	VisibilityShared  Visibility = "shared"
	VisibilityPrivate Visibility = "private"
)

func (v Visibility) IsValid() bool {
	switch v {
	case VisibilityShared, VisibilityPrivate:
		return true
	}
	return false
}

func ParseVisibility(value string) (Visibility, error) {
	visibility := Visibility(value)
	if !visibility.IsValid() {
		return "", fmt.Errorf("%w: invalid visibility %q", ErrInvalidState, value)
	}
	return visibility, nil
}

type Room struct {
	ID             uuid.UUID
	OwnerID        uuid.UUID
	Type           RoomType
	Language       Language
	Visibility     Visibility
	ExpiresAt      time.Time
	CreatedAt      time.Time
	IsGuestCreated bool
}

// IsExpired reports whether the room TTL has passed (inclusive of ExpiresAt).
func (r Room) IsExpired(now time.Time) bool {
	return !r.ExpiresAt.IsZero() && !now.Before(r.ExpiresAt)
}

type Participant struct {
	RoomID   uuid.UUID
	UserID   uuid.UUID
	Role     Role
	JoinedAt time.Time
}
