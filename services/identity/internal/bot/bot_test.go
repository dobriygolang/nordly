package bot_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/bot"
	"github.com/dobriygolang/project-nordly/services/identity/internal/bot/mocks"
)

func TestReserveLoginCodeRetriesCollision(t *testing.T) {
	t.Parallel()
	store := mocks.NewLoginCodeStore(t)
	payload := &model.TelegramLoginCode{
		TelegramID: 42,
		ExpiresAt:  time.Now().Add(5 * time.Minute),
	}
	store.EXPECT().Save(t.Context(), "collision", payload, 300).Return(model.ErrLoginCodeCollision).Once()
	store.EXPECT().Save(t.Context(), "reserved", payload, 300).Return(nil).Once()

	codes := []string{"collision", "reserved"}
	code, err := bot.ReserveLoginCode(t.Context(), store, payload, func(length int) (string, error) {
		require.Equal(t, 8, length)
		next := codes[0]
		codes = codes[1:]
		return next, nil
	})

	require.NoError(t, err)
	require.Equal(t, "reserved", code)
}

func TestReserveLoginCodeStopsAfterBoundedCollisions(t *testing.T) {
	t.Parallel()
	store := mocks.NewLoginCodeStore(t)
	payload := &model.TelegramLoginCode{
		TelegramID: 42,
		ExpiresAt:  time.Now().Add(model.LoginCodeTTL),
	}
	store.EXPECT().
		Save(t.Context(), "collision", payload, int(model.LoginCodeTTL/time.Second)).
		Return(model.ErrLoginCodeCollision).
		Times(8)

	code, err := bot.ReserveLoginCode(t.Context(), store, payload, func(length int) (string, error) {
		require.Equal(t, 8, length)
		return "collision", nil
	})

	require.Empty(t, code)
	require.ErrorIs(t, err, model.ErrLoginCodeCollision)
}
