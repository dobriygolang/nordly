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

// PublicLiveRoomURL builds a guest share link: {LIVE_PUBLIC_BASE_URL}/{room_id}.
func PublicLiveRoomURL(base string, roomID uuid.UUID) string {
	return fmt.Sprintf("%s/%s", strings.TrimRight(base, "/"), roomID)
}

func NewInviteLink(base string, roomID uuid.UUID, roomExpiresAt time.Time) InviteLink {
	return InviteLink{
		URL:       PublicLiveRoomURL(base, roomID),
		ExpiresAt: roomExpiresAt,
	}
}
