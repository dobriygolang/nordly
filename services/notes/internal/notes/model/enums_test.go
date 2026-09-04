package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPublishExpiryPolicyDays(t *testing.T) {
	t.Parallel()

	tests := []struct {
		policy PublishExpiryPolicy
		days   int
		valid  bool
	}{
		{policy: PublishExpiryPolicyNever, days: 0, valid: true},
		{policy: PublishExpiryPolicySevenDays, days: 7, valid: true},
		{policy: PublishExpiryPolicyThirtyDays, days: 30, valid: true},
		{policy: PublishExpiryPolicyNinetyDays, days: 90, valid: true},
		{policy: PublishExpiryPolicy("unsupported")},
	}
	for _, tt := range tests {
		days, valid := tt.policy.Days()
		require.Equal(t, tt.days, days)
		require.Equal(t, tt.valid, valid)
	}
}

func TestPublishAccessModeValidation(t *testing.T) {
	t.Parallel()

	require.True(t, PublishAccessModePublic.IsValid())
	require.True(t, PublishAccessModePassword.IsValid())
	require.False(t, PublishAccessMode("").IsValid())
	require.False(t, PublishAccessMode("unsupported").IsValid())
}
