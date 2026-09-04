package ws

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
)

const (
	wsRateLimit         = 200
	wsPingInterval      = 30 * time.Second
	wsReadDeadline      = 120 * time.Second
	wsWriteDeadline     = 10 * time.Second
	outboundQueueLimit  = replayBufferCap + 256
	closeReasonRoom     = "room closed"
	closeReasonShutdown = "server shutting down"
	closeReasonSlow     = "client too slow"
	closeReasonRate     = "rate limit exceeded"
	closeReasonInternal = "internal error"
)

type outboundFrame struct {
	messageType int
	data        []byte
}

type wsConn struct {
	socket Socket
	roomID uuid.UUID
	userID uuid.UUID
	role   model.Role
	room   *roomHub
	log    logger.Logger

	queueMu   sync.Mutex
	queue     []outboundFrame
	queueHead int
	wake      chan struct{}
	done      chan struct{}
	closing   bool
	closed    bool
	pumpOnce  sync.Once

	rateMu    sync.Mutex
	rateStart time.Time
	rateCount int

	pingInterval time.Duration
}

func newWSConn(
	socket Socket,
	roomID, userID uuid.UUID,
	role model.Role,
	log logger.Logger,
) *wsConn {
	return &wsConn{
		socket:       socket,
		roomID:       roomID,
		userID:       userID,
		role:         role,
		log:          log,
		queue:        make([]outboundFrame, 0, 128),
		wake:         make(chan struct{}, 1),
		done:         make(chan struct{}),
		rateStart:    time.Now(),
		pingInterval: wsPingInterval,
	}
}

func (c *wsConn) startWritePump() {
	c.pumpOnce.Do(func() {
		go c.writeLoop()
	})
}

func (c *wsConn) enqueueEnvelope(kind Kind, data any) bool {
	env, err := encodeEnvelope(kind, data)
	if err != nil {
		c.log.Error("ws encode envelope", "kind", kind, "err", err)
		c.requestClose(websocket.CloseInternalServerErr, closeReasonInternal)
		return false
	}
	return c.enqueue(env)
}

func (c *wsConn) enqueue(msg []byte) bool {
	return c.enqueueBatch([][]byte{msg})
}

func (c *wsConn) enqueueControl(messageType int, data []byte) bool {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()

	if c.closing || c.closed {
		return false
	}
	if c.queuedLocked()+1 > outboundQueueLimit {
		c.log.Warn(
			"ws slow client disconnected",
			"user", c.userID.String(),
			"room", c.roomID.String(),
		)
		c.queueCloseLocked(websocket.ClosePolicyViolation, closeReasonSlow, true)
		return false
	}
	c.prepareQueueLocked(1)
	c.queue = append(c.queue, outboundFrame{
		messageType: messageType,
		data:        data,
	})
	c.notifyWriterLocked()
	return true
}

func (c *wsConn) enqueueBatch(messages [][]byte) bool {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()

	if c.closing || c.closed {
		return false
	}
	if c.queuedLocked()+len(messages) > outboundQueueLimit {
		c.log.Warn(
			"ws slow client disconnected",
			"user", c.userID.String(),
			"room", c.roomID.String(),
		)
		c.queueCloseLocked(websocket.ClosePolicyViolation, closeReasonSlow, true)
		return false
	}
	c.prepareQueueLocked(len(messages))
	for _, message := range messages {
		c.queue = append(c.queue, outboundFrame{
			messageType: websocket.TextMessage,
			data:        message,
		})
	}
	c.notifyWriterLocked()
	return true
}

func (c *wsConn) requestClose(code int, reason string) {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()
	if c.closing || c.closed {
		return
	}
	c.queueCloseLocked(code, reason, false)
}

func (c *wsConn) queueCloseLocked(code int, reason string, discardPending bool) {
	c.closing = true
	if discardPending {
		c.queue = c.queue[:0]
		c.queueHead = 0
	} else {
		c.prepareQueueLocked(1)
	}
	c.queue = append(c.queue, outboundFrame{
		messageType: websocket.CloseMessage,
		data:        websocket.FormatCloseMessage(code, reason),
	})
	c.notifyWriterLocked()
}

func (c *wsConn) notifyWriterLocked() {
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

func (c *wsConn) queuedLocked() int {
	return len(c.queue) - c.queueHead
}

func (c *wsConn) prepareQueueLocked(additional int) {
	if c.queueHead == 0 ||
		(c.queueHead < 1024 && len(c.queue)+additional <= cap(c.queue)) {
		return
	}
	remaining := copy(c.queue, c.queue[c.queueHead:])
	clear(c.queue[remaining:])
	c.queue = c.queue[:remaining]
	c.queueHead = 0
}

func (c *wsConn) nextFrame() (outboundFrame, bool) {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()
	if c.queueHead == len(c.queue) {
		c.queue = c.queue[:0]
		c.queueHead = 0
		return outboundFrame{}, false
	}
	frame := c.queue[c.queueHead]
	c.queue[c.queueHead] = outboundFrame{}
	c.queueHead++
	return frame, true
}

func (c *wsConn) isClosing() bool {
	c.queueMu.Lock()
	defer c.queueMu.Unlock()
	return c.closing || c.closed
}

func (c *wsConn) rateOK() bool {
	c.rateMu.Lock()
	defer c.rateMu.Unlock()
	now := time.Now()
	if now.Sub(c.rateStart) >= time.Second {
		c.rateStart = now
		c.rateCount = 0
	}
	c.rateCount++
	return c.rateCount <= wsRateLimit
}

func (c *wsConn) writeLoop() {
	pinger := time.NewTicker(c.pingInterval)
	defer pinger.Stop()
	defer c.finish()

	for {
		select {
		case <-c.wake:
			for {
				frame, ok := c.nextFrame()
				if !ok {
					break
				}
				if err := c.writeFrame(frame); err != nil {
					c.log.Warn(
						"ws write failed",
						"user", c.userID.String(),
						"room", c.roomID.String(),
						"err", err,
					)
					return
				}
				if frame.messageType == websocket.CloseMessage {
					return
				}
			}
		case <-pinger.C:
			if c.isClosing() {
				continue
			}
			if err := c.socket.WriteControl(
				websocket.PingMessage,
				nil,
				time.Now().Add(wsWriteDeadline),
			); err != nil {
				c.log.Warn(
					"ws ping failed",
					"user", c.userID.String(),
					"room", c.roomID.String(),
					"err", err,
				)
				return
			}
		}
	}
}

func (c *wsConn) writeFrame(frame outboundFrame) error {
	switch frame.messageType {
	case websocket.CloseMessage, websocket.PingMessage, websocket.PongMessage:
		if err := c.socket.WriteControl(
			frame.messageType,
			frame.data,
			time.Now().Add(wsWriteDeadline),
		); err != nil {
			return fmt.Errorf("write control frame %d: %w", frame.messageType, err)
		}
		return nil
	}
	if err := c.socket.SetWriteDeadline(time.Now().Add(wsWriteDeadline)); err != nil {
		return fmt.Errorf("set write deadline: %w", err)
	}
	if err := c.socket.WriteMessage(frame.messageType, frame.data); err != nil {
		return fmt.Errorf("write message: %w", err)
	}
	return nil
}

func (c *wsConn) finish() {
	c.queueMu.Lock()
	if c.closed {
		c.queueMu.Unlock()
		return
	}
	c.closed = true
	c.closing = true
	c.queue = nil
	c.queueHead = 0
	close(c.done)
	c.queueMu.Unlock()

	if err := c.socket.Close(); err != nil {
		c.log.Debug(
			"ws socket close failed",
			"user", c.userID.String(),
			"room", c.roomID.String(),
			"err", err,
		)
	}
}

func encodeEnvelope(kind Kind, data any) ([]byte, error) {
	var raw json.RawMessage
	if data != nil {
		b, err := json.Marshal(data)
		if err != nil {
			return nil, fmt.Errorf("encode envelope %s data: %w", kind, err)
		}
		raw = b
	}
	out, err := json.Marshal(Envelope{Kind: kind.String(), Data: raw})
	if err != nil {
		return nil, fmt.Errorf("encode envelope %s: %w", kind, err)
	}
	return out, nil
}
