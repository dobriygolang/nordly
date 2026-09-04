package ws

import (
	"encoding/json"

	"github.com/google/uuid"
)

// Kind is an outbound WS envelope kind. Wire values stay snake_case.
type Kind string

const (
	KindOp                Kind = "op"
	KindSnapshot          Kind = "snapshot"
	KindCursor            Kind = "cursor"
	KindCodeRun           Kind = "code_run"
	KindRoomClosed        Kind = "room_closed"
	KindParticipantJoined Kind = "participant_joined"
	KindParticipantLeft   Kind = "participant_left"
	KindError             Kind = "error"
	KindPong              Kind = "pong"
	KindPresence          Kind = "presence"
)

func (k Kind) String() string { return string(k) }

// In is an inbound WS envelope kind.
type In string

const (
	InOp       In = "op"
	InSnapshot In = "snapshot"
	InCursor   In = "cursor"
	InPresence In = "presence"
	InCodeRun  In = "code_run"
	InPing     In = "ping"
)

func (k In) String() string { return string(k) }

// Envelope is the custom WS JSON frame (not proto).
type Envelope struct {
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data,omitempty"`
}

type opPayload struct {
	Payload []byte `json:"payload"`
}

type sequencedOpPayload struct {
	Seq     int64     `json:"seq"`
	UserID  uuid.UUID `json:"user_id"`
	Payload []byte    `json:"payload"`
}

type snapshotPayload struct {
	Seq     int64  `json:"seq"`
	Payload []byte `json:"payload"`
}

type cursorPayload struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}
