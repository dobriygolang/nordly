package dto

import (
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// RoomView is the in-process room snapshot for service and transport mappers.
type RoomView struct {
	Room         model.Room
	Participants []model.Participant
}

// NewRoomView builds a room view.
func NewRoomView(room model.Room, participants []model.Participant) *RoomView {
	return &RoomView{
		Room:         room,
		Participants: participants,
	}
}

// GuestJoinResult is returned after a guest joins a shared room.
type GuestJoinResult struct {
	AccessToken string
	ExpiresIn   int32
	Room        *RoomView
}

// GuestCreateResult is returned when a guest room or share-whiteboard room is created.
type GuestCreateResult struct {
	AccessToken string
	ExpiresIn   int32
	Room        *RoomView
	Invite      *model.InviteLink
}

// PublishBoardResult is returned when a whiteboard snapshot is published.
type PublishBoardResult struct {
	Slug string
	URL  string
}
