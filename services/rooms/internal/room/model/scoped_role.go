package model

// ScopedRole is the identity JWT role minted for a live room.
type ScopedRole string

const (
	ScopedRoleGuest ScopedRole = "guest"
	ScopedRoleOwner ScopedRole = "owner"
)

func (r ScopedRole) String() string { return string(r) }
