package model

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// InviteLink is the public guest URL for a shared room (UUID in path is the capability).
type InviteLink struct {
	URL       string
	ExpiresAt time.Time
}

func PublicLiveRoomURL(base string, roomID uuid.UUID) string {
	return fmt.Sprintf("%s/live/%s", strings.TrimRight(base, "/"), roomID)
}

func NewInviteLink(base string, roomID uuid.UUID, roomExpiresAt time.Time) InviteLink {
	return InviteLink{
		URL:       PublicLiveRoomURL(base, roomID),
		ExpiresAt: roomExpiresAt,
	}
}
