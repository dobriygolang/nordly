package ws

import (
	"time"

	"github.com/gorilla/websocket"
)

// Socket is the Gorilla WebSocket surface used by a connection.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Socket --output=./mocks --outpkg=mocks --filename=socket.go
type Socket interface {
	Close() error
	ReadMessage() (messageType int, p []byte, err error)
	SetCloseHandler(h func(code int, text string) error)
	SetPingHandler(h func(appData string) error)
	SetPongHandler(h func(appData string) error)
	SetReadDeadline(t time.Time) error
	SetReadLimit(limit int64)
	SetWriteDeadline(t time.Time) error
	WriteControl(messageType int, data []byte, deadline time.Time) error
	WriteMessage(messageType int, data []byte) error
}

var _ Socket = (*websocket.Conn)(nil)
