package ws

import (
	"errors"
	"slices"
	"sync"

	"github.com/google/uuid"
)

const replayBufferCap = 10_000

var (
	errRoomClosed       = errors.New("websocket room is closed")
	errConnectionClosed = errors.New("websocket connection is closed")
)

type roomHub struct {
	mu sync.Mutex

	clients map[*wsConn]struct{}
	closed  bool

	nextSeq int64
	buffer  []bufferedOp
	bufHead int
	bufLen  int

	lastSnapshot []byte
	snapshotSeq  int64
}

type bufferedOp struct {
	Seq     int64
	UserID  uuid.UUID
	Payload []byte
}

func newRoomHub() *roomHub {
	return &roomHub{
		clients: make(map[*wsConn]struct{}),
		buffer:  make([]bufferedOp, replayBufferCap),
	}
}

func (rh *roomHub) registerLocked(c *wsConn) error {
	if rh.closed {
		return errRoomClosed
	}
	bootstrap, err := rh.bootstrapLocked()
	if err != nil {
		return err
	}
	if !c.enqueueBatch(bootstrap) {
		return errConnectionClosed
	}

	c.room = rh
	rh.clients[c] = struct{}{}
	return rh.broadcastLocked(
		KindParticipantJoined,
		map[string]any{"user_id": c.userID},
	)
}

func (rh *roomHub) unregisterLocked(c *wsConn) error {
	if _, ok := rh.clients[c]; !ok {
		return nil
	}
	delete(rh.clients, c)
	if rh.closed {
		return nil
	}
	return rh.broadcastLocked(
		KindParticipantLeft,
		map[string]any{"user_id": c.userID},
	)
}

func (rh *roomHub) applyOpLocked(userID uuid.UUID, payload []byte) error {
	if rh.closed {
		return errRoomClosed
	}
	rh.nextSeq++
	op := bufferedOp{
		Seq:     rh.nextSeq,
		UserID:  userID,
		Payload: slices.Clone(payload),
	}
	rh.buffer[rh.bufHead] = op
	rh.bufHead = (rh.bufHead + 1) % replayBufferCap
	if rh.bufLen < replayBufferCap {
		rh.bufLen++
	}
	return rh.broadcastLocked(KindOp, sequencedOpPayload(op))
}

func (rh *roomHub) replaceSnapshotLocked(payload []byte) error {
	if rh.closed {
		return errRoomClosed
	}
	rh.lastSnapshot = slices.Clone(payload)
	rh.snapshotSeq = rh.nextSeq
	return nil
}

func (rh *roomHub) broadcastLocked(kind Kind, data any) error {
	if rh.closed {
		return errRoomClosed
	}
	envelope, err := encodeEnvelope(kind, data)
	if err != nil {
		return err
	}
	for client := range rh.clients {
		client.enqueue(envelope)
	}
	return nil
}

func (rh *roomHub) bootstrapLocked() ([][]byte, error) {
	messages := make([][]byte, 0, rh.bufLen+1)
	afterSeq := int64(0)
	if len(rh.lastSnapshot) > 0 {
		snapshot, err := encodeEnvelope(KindSnapshot, snapshotPayload{
			Seq:     rh.snapshotSeq,
			Payload: rh.lastSnapshot,
		})
		if err != nil {
			return nil, err
		}
		messages = append(messages, snapshot)
		afterSeq = rh.snapshotSeq
	}

	start := (rh.bufHead - rh.bufLen + replayBufferCap) % replayBufferCap
	for offset := 0; offset < rh.bufLen; offset++ {
		op := rh.buffer[(start+offset)%replayBufferCap]
		if op.Seq <= afterSeq {
			continue
		}
		envelope, err := encodeEnvelope(KindOp, sequencedOpPayload(op))
		if err != nil {
			return nil, err
		}
		messages = append(messages, envelope)
	}
	return messages, nil
}
