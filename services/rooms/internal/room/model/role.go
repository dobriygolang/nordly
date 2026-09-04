package model

import "fmt"

type Role string

const (
	RoleOwner       Role = "owner"
	RoleParticipant Role = "participant"
	RoleViewer      Role = "viewer"
)

func (r Role) IsValid() bool {
	switch r {
	case RoleOwner, RoleParticipant, RoleViewer:
		return true
	}
	return false
}

func (r Role) String() string { return string(r) }

func (r Role) CanEdit() bool {
	switch r {
	case RoleOwner, RoleParticipant:
		return true
	case RoleViewer:
		return false
	}
	return false
}

func ParseRole(value string) (Role, error) {
	role := Role(value)
	if !role.IsValid() {
		return "", fmt.Errorf("%w: invalid role %q", ErrInvalidState, value)
	}
	return role, nil
}
