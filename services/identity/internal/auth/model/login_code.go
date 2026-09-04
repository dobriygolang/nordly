package model

import "time"

// LoginCodeTTL is the fixed lifetime for Telegram login codes.
const LoginCodeTTL = 5 * time.Minute

// TelegramLoginCode holds profile data bound to a one-time login code.
type TelegramLoginCode struct {
	TelegramID int64
	FirstName  string
	LastName   string
	Username   string
	AvatarURL  string
	ExpiresAt  time.Time
}
