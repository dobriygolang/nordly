package ws

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
)

type Hub struct {
	log logger.Logger

	mu          sync.Mutex
	rooms       map[uuid.UUID]*roomHub
	closedRooms map[uuid.UUID]struct{}
	stopping    bool
}

func NewHub(log logger.Logger) *Hub {
	return &Hub{
		log:         log,
		rooms:       make(map[uuid.UUID]*roomHub),
		closedRooms: make(map[uuid.UUID]struct{}),
	}
}

func (h *Hub) register(c *wsConn) error {
	h.mu.Lock()
	if h.stopping {
		h.mu.Unlock()
		c.requestClose(websocket.CloseGoingAway, closeReasonShutdown)
		return errRoomClosed
	}
	if _, closed := h.closedRooms[c.roomID]; closed {
		h.mu.Unlock()
		c.requestClose(websocket.CloseNormalClosure, closeReasonRoom)
		return errRoomClosed
	}
	rh := h.rooms[c.roomID]
	if rh == nil {
		rh = newRoomHub()
		h.rooms[c.roomID] = rh
	}
	rh.mu.Lock()
	h.mu.Unlock()

	err := rh.registerLocked(c)
	rh.mu.Unlock()
	if err == nil {
		return nil
	}
	if errors.Is(err, errRoomClosed) || errors.Is(err, errConnectionClosed) {
		c.requestClose(websocket.CloseNormalClosure, closeReasonRoom)
		return err
	}
	h.log.Error("ws register client", "room", c.roomID.String(), "err", err)
	c.requestClose(websocket.CloseInternalServerErr, closeReasonInternal)
	return err
}

func (h *Hub) unregister(c *wsConn) {
	rh := c.room
	if rh == nil {
		return
	}
	rh.mu.Lock()
	err := rh.unregisterLocked(c)
	rh.mu.Unlock()
	if err != nil && !errors.Is(err, errRoomClosed) {
		h.log.Error("ws unregister client", "room", c.roomID.String(), "err", err)
	}
}

func (h *Hub) applyOp(c *wsConn, payload []byte) error {
	rh := c.room
	if rh == nil {
		return errConnectionClosed
	}
	rh.mu.Lock()
	err := rh.applyOpLocked(c.userID, payload)
	rh.mu.Unlock()
	return err
}

func (h *Hub) replaceSnapshot(c *wsConn, payload []byte) error {
	rh := c.room
	if rh == nil {
		return errConnectionClosed
	}
	rh.mu.Lock()
	err := rh.replaceSnapshotLocked(payload)
	rh.mu.Unlock()
	return err
}

func (h *Hub) broadcastFrom(c *wsConn, kind Kind, data any) error {
	rh := c.room
	if rh == nil {
		return errConnectionClosed
	}
	rh.mu.Lock()
	err := rh.broadcastLocked(kind, data)
	rh.mu.Unlock()
	return err
}

// CloseRoom atomically prevents new registrations, queues room_closed, and then
// queues a normal close frame for every connected client.
func (h *Hub) CloseRoom(roomID uuid.UUID) {
	h.mu.Lock()
	h.closedRooms[roomID] = struct{}{}
	rh := h.rooms[roomID]
	delete(h.rooms, roomID)
	if rh == nil {
		h.mu.Unlock()
		return
	}
	rh.mu.Lock()
	h.mu.Unlock()

	roomClosed, err := encodeEnvelope(
		KindRoomClosed,
		map[string]any{"room_id": roomID.String()},
	)
	rh.closed = true
	for client := range rh.clients {
		if err == nil {
			client.enqueue(roomClosed)
			client.requestClose(websocket.CloseNormalClosure, closeReasonRoom)
		} else {
			client.requestClose(websocket.CloseInternalServerErr, closeReasonInternal)
		}
		delete(rh.clients, client)
	}
	rh.mu.Unlock()

	if err != nil {
		h.log.Error("ws encode room closed", "room", roomID.String(), "err", err)
	}
}

// CloseAll prevents new registrations and closes every connection as a server
// shutdown, without declaring the persisted rooms closed.
func (h *Hub) CloseAll() {
	h.mu.Lock()
	if h.stopping {
		h.mu.Unlock()
		return
	}
	h.stopping = true
	rooms := make([]*roomHub, 0, len(h.rooms))
	for roomID, rh := range h.rooms {
		delete(h.rooms, roomID)
		rooms = append(rooms, rh)
	}
	h.mu.Unlock()

	for _, rh := range rooms {
		rh.mu.Lock()
		rh.closed = true
		for client := range rh.clients {
			client.requestClose(websocket.CloseGoingAway, closeReasonShutdown)
			delete(rh.clients, client)
		}
		rh.mu.Unlock()
	}
}

func (h *Hub) readLoop(ctx context.Context, c *wsConn) {
	defer func() {
		h.unregister(c)
		c.requestClose(websocket.CloseNormalClosure, "")
	}()

	c.socket.SetReadLimit(256 * 1024)
	if err := c.socket.SetReadDeadline(time.Now().Add(wsReadDeadline)); err != nil {
		h.log.Warn("ws set read deadline", "err", err)
		c.requestClose(websocket.CloseInternalServerErr, closeReasonInternal)
		return
	}
	c.socket.SetPongHandler(func(string) error {
		return c.socket.SetReadDeadline(time.Now().Add(wsReadDeadline))
	})
	c.socket.SetPingHandler(func(appData string) error {
		if !c.enqueueControl(websocket.PongMessage, []byte(appData)) {
			return errConnectionClosed
		}
		return nil
	})
	c.socket.SetCloseHandler(func(code int, text string) error {
		c.requestClose(code, text)
		return nil
	})

	for {
		if ctx.Err() != nil {
			c.requestClose(websocket.CloseGoingAway, "request canceled")
			return
		}
		messageType, data, err := c.socket.ReadMessage()
		if err != nil {
			return
		}
		if messageType != websocket.TextMessage {
			c.requestClose(websocket.CloseUnsupportedData, "text messages required")
			return
		}
		if !c.rateOK() {
			c.requestClose(websocket.ClosePolicyViolation, closeReasonRate)
			return
		}

		var envelope Envelope
		if err := json.Unmarshal(data, &envelope); err != nil {
			c.requestClose(websocket.CloseInvalidFramePayloadData, "invalid JSON message")
			return
		}
		if !h.handleEnvelope(c, envelope) {
			return
		}
	}
}

func (h *Hub) handleEnvelope(c *wsConn, envelope Envelope) bool {
	switch In(envelope.Kind) {
	case InPing:
		return c.enqueueEnvelope(KindPong, nil)
	case InOp:
		if !c.role.CanEdit() {
			c.requestClose(websocket.ClosePolicyViolation, "participant is read-only")
			return false
		}
		var payload opPayload
		if err := json.Unmarshal(envelope.Data, &payload); err != nil || len(payload.Payload) == 0 {
			c.requestClose(websocket.CloseInvalidFramePayloadData, "invalid op payload")
			return false
		}
		return h.handleRoomResult(c, h.applyOp(c, payload.Payload))
	case InCursor:
		var payload cursorPayload
		if err := json.Unmarshal(envelope.Data, &payload); err != nil {
			c.requestClose(websocket.CloseInvalidFramePayloadData, "invalid cursor payload")
			return false
		}
		return h.handleRoomResult(c, h.broadcastFrom(c, KindCursor, map[string]any{
			"user_id": c.userID,
			"line":    payload.Line,
			"column":  payload.Column,
		}))
	case InPresence:
		return h.handleRoomResult(c, h.broadcastFrom(c, KindPresence, json.RawMessage(envelope.Data)))
	case InCodeRun:
		if !c.role.CanEdit() {
			c.requestClose(websocket.ClosePolicyViolation, "participant is read-only")
			return false
		}
		return h.handleRoomResult(c, h.broadcastFrom(c, KindCodeRun, json.RawMessage(envelope.Data)))
	case InSnapshot:
		if !c.role.CanEdit() {
			c.requestClose(websocket.ClosePolicyViolation, "participant is read-only")
			return false
		}
		var payload opPayload
		if err := json.Unmarshal(envelope.Data, &payload); err != nil || len(payload.Payload) == 0 {
			c.requestClose(websocket.CloseInvalidFramePayloadData, "invalid snapshot payload")
			return false
		}
		return h.handleRoomResult(c, h.replaceSnapshot(c, payload.Payload))
	default:
		c.requestClose(websocket.CloseUnsupportedData, "unsupported message kind")
		return false
	}
}

func (h *Hub) handleRoomResult(c *wsConn, err error) bool {
	if err == nil {
		return true
	}
	if errors.Is(err, errRoomClosed) || errors.Is(err, errConnectionClosed) {
		c.requestClose(websocket.CloseNormalClosure, closeReasonRoom)
		return false
	}
	h.log.Error("ws room operation", "room", c.roomID.String(), "err", err)
	c.requestClose(websocket.CloseInternalServerErr, closeReasonInternal)
	return false
}
