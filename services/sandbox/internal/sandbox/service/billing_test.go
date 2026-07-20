package service

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	billingmocks "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
)

func TestGateCodeRunConsumesUsage(t *testing.T) {
	t.Parallel()
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckAndConsumeUsage(mock.Anything, "user-1", billingadapter.EntitlementCodeRunsPerDay, 1).
		Return(billingadapter.ErrQuotaExceeded)

	svc := New(Deps{Billing: billing}).(*sandboxService)
	err := svc.gateCodeRun(context.Background(), "user-1")
	require.ErrorIs(t, err, ErrQuotaExceeded)
}

func TestQuotaSubjectUsesRoomID(t *testing.T) {
	t.Parallel()
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckAndConsumeUsage(mock.Anything, "room-id", billingadapter.EntitlementCodeRunsPerDay, 1).
		Return(nil)

	svc := New(Deps{Billing: billing}).(*sandboxService)
	require.NoError(t, svc.gateCodeRun(context.Background(), quotaSubject("guest-user", "room-id")))
}

func TestFormatCodeConsumesQuota(t *testing.T) {
	t.Parallel()
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckAndConsumeUsage(mock.Anything, "user-1", billingadapter.EntitlementCodeRunsPerDay, 1).
		Return(billingadapter.ErrQuotaExceeded)

	svc := New(Deps{
		Billing:      billing,
		Runner:       runner.DefaultFakeRunner(),
		MaxCodeBytes: 1024,
	}).(*sandboxService)

	_, err := svc.FormatCode(context.Background(), FormatCodeInput{
		UserID:   "user-1",
		Language: "go",
		Code:     "package main",
	})
	require.ErrorIs(t, err, ErrQuotaExceeded)
}
