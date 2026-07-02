package identityapi

import (
	"errors"
	"io"
	"net/http"

	"github.com/dobriygolang/project-nordly/services/identity/internal/adapter/telegram"
	authservice "github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
)

// UserAvatarHTTP serves profile photos (Telegram proxy or external URL redirect).
func (i *Implementation) UserAvatarHTTP() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		userID := r.PathValue("id")
		if userID == "" {
			writeHTTPError(w, invalidArgument("user id required"))
			return
		}

		user, err := i.service.GetUser(r.Context(), userID)
		if err != nil {
			writeHTTPError(w, mapServiceError(err))
			return
		}

		if path, ok := telegram.ParseStoreRef(user.AvatarURL); ok && path != "" {
			i.serveTelegramFile(w, r, path)
			return
		}

		if user.AvatarURL != "" {
			http.Redirect(w, r, user.AvatarURL, http.StatusFound)
			return
		}

		writeHTTPError(w, notFound("avatar not found"))
	}
}

func (i *Implementation) serveTelegramFile(w http.ResponseWriter, r *http.Request, filePath string) {
	body, contentType, err := telegram.OpenFile(r.Context(), i.telegramBotToken, filePath)
	if err != nil {
		if errors.Is(err, authservice.ErrNotFound) {
			writeHTTPError(w, notFound("avatar not found"))
			return
		}
		writeHTTPError(w, err)
		return
	}
	defer func() { _ = body.Close() }()

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, body)
}
