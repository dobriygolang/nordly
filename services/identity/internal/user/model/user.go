package model

import "time"

// User represents a platform account linked to Telegram.
type User struct {
	ID         string
	Username   string
	TelegramID *int64
	AvatarURL  string
	Timezone   string
	CreatedAt  time.Time
	UpdatedAt  time.Time
}
