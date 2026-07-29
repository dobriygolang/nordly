package format_code_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	billingmocks "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/format_code"
)

func TestFormatCodeConsumesQuota(t *testing.T) {
	t.Parallel()
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckAndConsumeUsage(mock.Anything, "user-1", billingadapter.EntitlementCodeRunsPerDay, 1).
		Return(billingadapter.ErrQuotaExceeded)

	h := format_code.New(format_code.Config{
		Billing: billing,
		Runner:  runner.DefaultFakeRunner(),
	})
	_, err := h.Handle(context.Background(), format_code.Command{
		UserID:       "user-1",
		Language:     "go",
		Code:         "package main",
		MaxCodeBytes: 1024,
	})
	require.ErrorIs(t, err, model.ErrQuotaExceeded)
}

func TestFormatCodeUsesRoomQuotaSubject(t *testing.T) {
	t.Parallel()
	billing := billingmocks.NewClient(t)
	billing.EXPECT().
		CheckAndConsumeUsage(mock.Anything, "room-id", billingadapter.EntitlementCodeRunsPerDay, 1).
		Return(nil)

	h := format_code.New(format_code.Config{
		Billing: billing,
		Runner:  runner.DefaultFakeRunner(),
	})
	_, err := h.Handle(context.Background(), format_code.Command{
		UserID:       "guest-user",
		RoomID:       "room-id",
		Language:     "go",
		Code:         "package main\n",
		MaxCodeBytes: 1024,
	})
	require.NoError(t, err)
}
