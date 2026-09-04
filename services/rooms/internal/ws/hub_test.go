package ws

import (
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
)

func TestConcurrentOpsUseOneRoomOrderForSequenceBufferAndFanout(t *testing.T) {
	t.Parallel()

	hub := NewHub(logger.Nop())
	roomID := uuid.New()
	first := queuedTestConn(roomID)
	second := queuedTestConn(roomID)
	require.NoError(t, hub.register(first))
	require.NoError(t, hub.register(second))
	drainEnvelopes(t, first)
	drainEnvelopes(t, second)

	const opCount = 500
	start := make(chan struct{})
	errs := make(chan error, opCount)
	var wg sync.WaitGroup
	for index := 0; index < opCount; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			client := first
			if index%2 == 1 {
				client = second
			}
			errs <- hub.applyOp(client, []byte(fmt.Sprintf("op-%03d", index)))
		}(index)
	}
	close(start)
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	firstOps := sequencedOps(t, drainEnvelopes(t, first))
	secondOps := sequencedOps(t, drainEnvelopes(t, second))
	require.Len(t, firstOps, opCount)
	require.Equal(t, firstOps, secondOps)
	for index, op := range firstOps {
		require.Equal(t, int64(index+1), op.Seq)
	}

	first.room.mu.Lock()
	defer first.room.mu.Unlock()
	require.Equal(t, int64(opCount), first.room.nextSeq)
	require.Equal(t, opCount, first.room.bufLen)
	for index := 0; index < opCount; index++ {
		require.Equal(t, int64(index+1), first.room.buffer[index].Seq)
	}
}

func TestLateJoinQueuesSnapshotAndReplayBeforeLiveVisibility(t *testing.T) {
	t.Parallel()

	for iteration := 0; iteration < 200; iteration++ {
		hub := NewHub(logger.Nop())
		roomID := uuid.New()
		existing := queuedTestConn(roomID)
		require.NoError(t, hub.register(existing))
		drainEnvelopes(t, existing)

		require.NoError(t, hub.applyOp(existing, []byte("before-snapshot")))
		require.NoError(t, hub.replaceSnapshot(existing, []byte("snapshot")))
		require.NoError(t, hub.applyOp(existing, []byte("after-snapshot")))
		drainEnvelopes(t, existing)

		joining := queuedTestConn(roomID)
		start := make(chan struct{})
		registerErr := make(chan error, 1)
		opErr := make(chan error, 1)
		go func() {
			<-start
			registerErr <- hub.register(joining)
		}()
		go func() {
			<-start
			opErr <- hub.applyOp(existing, []byte("racing-live-op"))
		}()
		close(start)
		require.NoError(t, <-registerErr)
		require.NoError(t, <-opErr)

		envelopes := drainEnvelopes(t, joining)
		require.NotEmpty(t, envelopes)
		require.Equal(t, KindSnapshot.String(), envelopes[0].Kind)

		var snapshot snapshotPayload
		require.NoError(t, json.Unmarshal(envelopes[0].Data, &snapshot))
		require.Equal(t, int64(1), snapshot.Seq)
		require.Equal(t, []byte("snapshot"), snapshot.Payload)

		ops := sequencedOps(t, envelopes)
		require.Len(t, ops, 2)
		require.Equal(t, int64(2), ops[0].Seq)
		require.Equal(t, []byte("after-snapshot"), ops[0].Payload)
		require.Equal(t, int64(3), ops[1].Seq)
		require.Equal(t, []byte("racing-live-op"), ops[1].Payload)
	}
}

func TestNewestSnapshotReplacesLargerSnapshot(t *testing.T) {
	t.Parallel()

	hub := NewHub(logger.Nop())
	client := queuedTestConn(uuid.New())
	require.NoError(t, hub.register(client))
	require.NoError(t, hub.replaceSnapshot(client, make([]byte, 4096)))
	require.NoError(t, hub.replaceSnapshot(client, []byte("newer")))

	client.room.mu.Lock()
	defer client.room.mu.Unlock()
	require.Equal(t, []byte("newer"), client.room.lastSnapshot)
}

func TestCloseAndRegisterRaceCannotLeaveVisibleClient(t *testing.T) {
	t.Parallel()

	for iteration := 0; iteration < 200; iteration++ {
		hub := NewHub(logger.Nop())
		roomID := uuid.New()
		client := queuedTestConn(roomID)
		start := make(chan struct{})
		var wg sync.WaitGroup
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_ = hub.register(client)
		}()
		go func() {
			defer wg.Done()
			<-start
			hub.CloseRoom(roomID)
		}()
		close(start)
		wg.Wait()
		require.True(t, client.isClosing())

		late := queuedTestConn(roomID)
		require.ErrorIs(t, hub.register(late), errRoomClosed)
		require.True(t, late.isClosing())
	}
}

func queuedTestConn(roomID uuid.UUID) *wsConn {
	return newWSConn(
		nil,
		roomID,
		uuid.New(),
		model.RoleParticipant,
		logger.Nop(),
	)
}

func drainEnvelopes(t *testing.T, client *wsConn) []Envelope {
	t.Helper()
	client.queueMu.Lock()
	frames := append([]outboundFrame(nil), client.queue[client.queueHead:]...)
	client.queue = client.queue[:0]
	client.queueHead = 0
	client.queueMu.Unlock()

	envelopes := make([]Envelope, 0, len(frames))
	for _, frame := range frames {
		if frame.messageType != websocket.TextMessage {
			continue
		}
		var envelope Envelope
		require.NoError(t, json.Unmarshal(frame.data, &envelope))
		envelopes = append(envelopes, envelope)
	}
	return envelopes
}

func sequencedOps(t *testing.T, envelopes []Envelope) []sequencedOpPayload {
	t.Helper()
	ops := make([]sequencedOpPayload, 0, len(envelopes))
	for _, envelope := range envelopes {
		if envelope.Kind != KindOp.String() {
			continue
		}
		var op sequencedOpPayload
		require.NoError(t, json.Unmarshal(envelope.Data, &op))
		ops = append(ops, op)
	}
	return ops
}
