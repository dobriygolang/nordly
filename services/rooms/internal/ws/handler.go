package ws

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
)

type RoomStore interface {
	GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error)
	GetRole(ctx context.Context, roomID, userID uuid.UUID) (model.Role, error)
	AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error)
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
	hub.RoomResolver = store.GetRoom
	hub.RoleResolver = store.GetRole
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

	token := r.URL.Query().Get("token")
	if token == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			token = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if token == "" {
		http.Error(w, "missing token", http.StatusUnauthorized)
		return
	}

	expectedScope := fmt.Sprintf("editor:%s", roomID)
	claims, err := h.JWT.ParseScoped(token, expectedScope)
	if err != nil {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		http.Error(w, "invalid token subject", http.StatusUnauthorized)
		return
	}
	isGuest := claims.Role == jwt.RoleGuest

	room, err := h.Store.GetRoom(r.Context(), roomID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			http.Error(w, "room not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal", http.StatusInternalServerError)
		return
	}
	if repository.IsExpired(room, time.Now().UTC()) {
		http.Error(w, "room expired", http.StatusGone)
		return
	}

	var role model.Role
	if isGuest {
		if room.Visibility != model.VisibilityShared {
			http.Error(w, "private room: guests not allowed", http.StatusForbidden)
			return
		}
		// Invited guests collaborate in the shared editor (not read-only).
		role = model.RoleParticipant
	} else {
		if room.Visibility == model.VisibilityPrivate && uid != room.OwnerID {
			if _, gerr := h.Store.GetRole(r.Context(), roomID, uid); errors.Is(gerr, repository.ErrNotFound) {
				http.Error(w, "private room: not authorized", http.StatusForbidden)
				return
			}
		}

		var pErr error
		role, pErr = h.Store.GetRole(r.Context(), roomID, uid)
		if pErr != nil {
			if !errors.Is(pErr, repository.ErrNotFound) {
				http.Error(w, "internal", http.StatusInternalServerError)
				return
			}
			if room.Visibility != model.VisibilityShared {
				http.Error(w, "not a participant", http.StatusForbidden)
				return
			}
			row, addErr := h.Store.AddParticipant(r.Context(), model.Participant{
				RoomID:   roomID,
				UserID:   uid,
				Role:     model.RoleParticipant,
				JoinedAt: time.Now().UTC(),
			})
			if addErr != nil {
				http.Error(w, "internal", http.StatusInternalServerError)
				return
			}
			role = row.Role
		}
	}

	ws, err := h.Upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.Log.Warn("ws upgrade failed", "err", err)
		return
	}

	c := newWSConn(ws, roomID, uid, role, h.Log)
	h.Hub.register(roomID, c)
	go c.writeLoop()

	if snap := h.Hub.SnapshotOf(roomID); len(snap) > 0 {
		c.enqueue(mustEnvelope(KindSnapshot, opPayload{Payload: snap}))
	} else {
		h.Hub.replayOpsToClient(roomID, c)
	}

	h.Hub.readLoop(r.Context(), c)
}
