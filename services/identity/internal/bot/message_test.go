package bot

import (
	"testing"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/stretchr/testify/require"
)

func TestHandleMessageRejectsMissingTelegramPointers(t *testing.T) {
	t.Parallel()
	command := func() *tgbotapi.Message {
		return &tgbotapi.Message{
			Text:     "/start",
			Entities: []tgbotapi.MessageEntity{{Type: "bot_command", Length: len("/start")}},
		}
	}

	t.Run("sender", func(t *testing.T) {
		t.Parallel()
		message := command()
		message.Chat = &tgbotapi.Chat{ID: 1}
		err := (&Bot{}).handleMessage(t.Context(), message)
		require.ErrorContains(t, err, "no sender")
	})

	t.Run("chat", func(t *testing.T) {
		t.Parallel()
		message := command()
		message.From = &tgbotapi.User{ID: 1}
		err := (&Bot{}).handleMessage(t.Context(), message)
		require.ErrorContains(t, err, "no chat")
	})
}
