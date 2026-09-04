package ws

import (
	"encoding/binary"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
	wsmocks "github.com/dobriygolang/project-nordly/services/rooms/internal/ws/mocks"
)

func TestWritePumpOrdersTextBeforeCloseControl(t *testing.T) {
	t.Parallel()

	socket := wsmocks.NewSocket(t)
	var orderMu sync.Mutex
	var order []string
	socket.EXPECT().SetWriteDeadline(mock.Anything).Return(nil).Once()
	socket.EXPECT().
		WriteMessage(websocket.TextMessage, []byte("message")).
		Run(func(int, []byte) {
			orderMu.Lock()
			order = append(order, "text")
			orderMu.Unlock()
		}).
		Return(nil).
		Once()
	socket.EXPECT().
		WriteControl(
			websocket.CloseMessage,
			mock.MatchedBy(func(payload []byte) bool {
				code, reason := decodeClosePayload(payload)
				return code == websocket.CloseNormalClosure && reason == closeReasonRoom
			}),
			mock.Anything,
		).
		Run(func(int, []byte, time.Time) {
			orderMu.Lock()
			order = append(order, "close")
			orderMu.Unlock()
		}).
		Return(nil).
		Once()
	socket.EXPECT().Close().Return(nil).Once()

	client := newWSConn(
		socket,
		uuid.New(),
		uuid.New(),
		model.RoleParticipant,
		logger.Nop(),
	)
	client.pingInterval = time.Hour
	require.True(t, client.enqueue([]byte("message")))
	client.requestClose(websocket.CloseNormalClosure, closeReasonRoom)
	client.startWritePump()
	waitForDone(t, client)

	orderMu.Lock()
	defer orderMu.Unlock()
	require.Equal(t, []string{"text", "close"}, order)
	require.False(t, client.enqueue([]byte("after close")))
}

func TestWriteFailureClosesSocketAndRejectsEnqueue(t *testing.T) {
	t.Parallel()

	socket := wsmocks.NewSocket(t)
	writeErr := errors.New("write failed")
	socket.EXPECT().SetWriteDeadline(mock.Anything).Return(nil).Once()
	socket.EXPECT().WriteMessage(websocket.TextMessage, []byte("message")).Return(writeErr).Once()
	socket.EXPECT().Close().Return(nil).Once()

	client := newWSConn(
		socket,
		uuid.New(),
		uuid.New(),
		model.RoleParticipant,
		logger.Nop(),
	)
	client.pingInterval = time.Hour
	require.True(t, client.enqueue([]byte("message")))
	client.startWritePump()
	waitForDone(t, client)
	require.False(t, client.enqueue([]byte("after failure")))
}

func TestQueueOverflowClosesWithPolicyViolation(t *testing.T) {
	t.Parallel()

	client := queuedTestConn(uuid.New())
	messages := make([][]byte, outboundQueueLimit)
	for index := range messages {
		messages[index] = []byte("message")
	}
	require.True(t, client.enqueueBatch(messages))
	require.False(t, client.enqueue([]byte("overflow")))
	require.False(t, client.enqueue([]byte("after close")))

	client.queueMu.Lock()
	defer client.queueMu.Unlock()
	require.Len(t, client.queue, 1)
	require.Equal(t, websocket.CloseMessage, client.queue[0].messageType)
	code, reason := decodeClosePayload(client.queue[0].data)
	require.Equal(t, websocket.ClosePolicyViolation, code)
	require.Equal(t, closeReasonSlow, reason)
}

func TestWritePumpOwnsPingAndCloseControls(t *testing.T) {
	t.Parallel()

	socket := wsmocks.NewSocket(t)
	var client *wsConn
	socket.EXPECT().
		WriteControl(websocket.PingMessage, []byte(nil), mock.Anything).
		Run(func(int, []byte, time.Time) {
			client.requestClose(websocket.ClosePolicyViolation, closeReasonRate)
		}).
		Return(nil).
		Once()
	socket.EXPECT().
		WriteControl(
			websocket.CloseMessage,
			mock.MatchedBy(func(payload []byte) bool {
				code, reason := decodeClosePayload(payload)
				return code == websocket.ClosePolicyViolation && reason == closeReasonRate
			}),
			mock.Anything,
		).
		Return(nil).
		Once()
	socket.EXPECT().Close().Return(nil).Once()

	client = newWSConn(
		socket,
		uuid.New(),
		uuid.New(),
		model.RoleParticipant,
		logger.Nop(),
	)
	client.pingInterval = time.Millisecond
	client.startWritePump()
	waitForDone(t, client)
}

func waitForDone(t *testing.T, client *wsConn) {
	t.Helper()
	select {
	case <-client.done:
	case <-time.After(5 * time.Second):
		t.Fatal("timed out waiting for websocket write pump")
	}
}

func decodeClosePayload(payload []byte) (int, string) {
	if len(payload) < 2 {
		return websocket.CloseNoStatusReceived, ""
	}
	return int(binary.BigEndian.Uint16(payload[:2])), string(payload[2:])
}
