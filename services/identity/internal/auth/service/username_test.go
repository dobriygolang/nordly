package service_test

import (
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/service/mocks"
)

func TestAllocateUsernameUsesCandidate(t *testing.T) {
	t.Parallel()
	repo := mocks.NewUsernameExistsChecker(t)
	repo.EXPECT().UsernameExists(t.Context(), "my_user").Return(false, nil)

	username, err := service.AllocateUsername(t.Context(), repo, "@My_User")
	require.NoError(t, err)
	require.Equal(t, "my_user", username)
}

func TestAllocateUsernameAddsSuffixOnCollision(t *testing.T) {
	t.Parallel()
	repo := mocks.NewUsernameExistsChecker(t)
	repo.EXPECT().UsernameExists(t.Context(), "ivan").Return(true, nil)
	repo.EXPECT().UsernameExists(t.Context(), mock.MatchedBy(func(s string) bool {
		return s != "ivan" && len(s) > 4
	})).Return(false, nil)

	username, err := service.AllocateUsername(t.Context(), repo, "Ivan")
	require.NoError(t, err)
	require.NotEqual(t, "ivan", username)
}
