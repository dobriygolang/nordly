package roomsapi

import (
	roomservice "github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/ws"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

type Implementation struct {
	roomsv1.UnimplementedRoomsServiceServer
	service roomservice.Service
	hub     *ws.Hub
}

func NewImplementation(svc roomservice.Service, hub *ws.Hub) *Implementation {
	return &Implementation{service: svc, hub: hub}
}
