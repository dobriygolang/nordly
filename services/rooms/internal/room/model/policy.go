package model

import "fmt"

// RoleForInvitee picks participant role for a new joiner.
func RoleForInvitee(room Room, existing []Participant) Role {
	switch room.Type {
	case RoomTypeInterview:
		for _, p := range existing {
			if p.Role == RoleInterviewer {
				return RoleParticipant
			}
		}
		return RoleInterviewer
	case RoomTypePairMock, RoomTypePractice, RoomTypeSystemDesign:
		return RoleParticipant
	}
	return RoleViewer
}

// ValidateCreate checks create payload before persistence.
func ValidateCreate(roomType RoomType, lang Language) error {
	if roomType != "" && !roomType.IsValid() {
		return fmt.Errorf("invalid room type %q", roomType)
	}
	if !lang.IsValid() {
		return fmt.Errorf("invalid language %q", lang)
	}
	return nil
}
