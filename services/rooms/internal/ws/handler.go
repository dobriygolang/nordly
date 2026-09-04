package ws

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
)

type RoomStore interface {
	GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error)
	GetRole(ctx context.Context, roomID, userID uuid.UUID) (model.Role, error)
}

//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=RoomStore --output=./mocks --outpkg=mocks --filename=room_store.go

type Handler struct {
	Hub      *Hub
	JWT      *jwt.Validator
	Store    RoomStore
	Log      logger.Logger
	Upgrader websocket.Upgrader
}

func NewHandler(hub *Hub, v *jwt.Validator, store RoomStore, log logger.Logger, allowedOrigins []string) *Handler {
	origins := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origins[origin] = struct{}{}
	}
	return &Handler{
		Hub:   hub,
		JWT:   v,
		Store: store,
		Log:   log,
		Upgrader: websocket.Upgrader{
			ReadBufferSize:  8192,
			WriteBufferSize: 8192,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}
				_, ok := origins[origin]
				return ok
			},
		},
	}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	raw := r.PathValue("roomId")
	roomID, err := uuid.Parse(raw)
	if err != nil {
		http.Error(w, "bad room id", http.StatusBadRequest)
		return
	}

	token, subprotocol, err := wsAccessToken(r)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	expectedScope := jwt.EditorScope("editor:" + roomID.String())
	claims, err := h.JWT.ParseEditorAccess(token, expectedScope)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	uid := uuid.MustParse(claims.UserID)
	isGuest := claims.Role == jwt.RoleGuest

	room, err := h.Store.GetRoom(r.Context(), roomID)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}
	if room.IsExpired(time.Now().UTC()) {
		http.Error(w, "room expired", http.StatusGone)
		return
	}

	if isGuest && room.Visibility != model.VisibilityShared {
		http.Error(w, "private room: guests not allowed", http.StatusForbidden)
		return
	}
	role, err := h.Store.GetRole(r.Context(), roomID, uid)
	if err != nil {
		if errors.Is(err, model.ErrNotFound) {
			http.Error(w, "token subject is not a room participant", http.StatusForbidden)
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}

	var upgradeHeader http.Header
	if subprotocol != "" {
		upgradeHeader = http.Header{}
		upgradeHeader.Set("Sec-WebSocket-Protocol", subprotocol)
	}
	ws, err := h.Upgrader.Upgrade(w, r, upgradeHeader)
	if err != nil {
		h.Log.Warn("ws upgrade failed", "err", err)
		return
	}

	c := newWSConn(ws, roomID, uid, role, h.Log)
	c.startWritePump()
	if err := h.Hub.register(c); err != nil {
		return
	}
	h.Hub.readLoop(r.Context(), c)
}
