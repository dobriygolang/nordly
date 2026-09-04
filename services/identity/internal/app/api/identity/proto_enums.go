package identityapi

import (
	"fmt"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

func scopedRoleFromProto(r identityv1.ScopedRole) (authmodel.ScopedRole, error) {
	switch r {
	case identityv1.ScopedRole_SCOPED_ROLE_GUEST:
		return authmodel.ScopedRoleGuest, nil
	case identityv1.ScopedRole_SCOPED_ROLE_OWNER:
		return authmodel.ScopedRoleOwner, nil
	default:
		return "", fmt.Errorf("scoped role is required")
	}
}
