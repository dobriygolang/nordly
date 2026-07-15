package service

import (
	"context"
	"testing"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
)

type stubBilling struct {
	usageErr error
	subject  string
}

func (s *stubBilling) CheckAndConsumeUsage(_ context.Context, subject, _ string, _ int) error {
	s.subject = subject
	return s.usageErr
}

func TestGateCodeRunConsumesUsage(t *testing.T) {
	t.Parallel()
	svc := New(Deps{
		Billing: &stubBilling{usageErr: billingadapter.ErrQuotaExceeded},
	}).(*sandboxService)

	err := svc.gateCodeRun(context.Background(), "user-1")
	if err != ErrQuotaExceeded {
		t.Fatalf("expected quota exceeded, got %v", err)
	}
}

func TestQuotaSubjectUsesRoomID(t *testing.T) {
	t.Parallel()
	billing := &stubBilling{}
	svc := New(Deps{Billing: billing}).(*sandboxService)

	if err := svc.gateCodeRun(context.Background(), quotaSubject("guest-user", "room-id")); err != nil {
		t.Fatalf("gate code run: %v", err)
	}
	if billing.subject != "room-id" {
		t.Fatalf("expected stable room quota subject, got %q", billing.subject)
	}
}

func TestFormatCodeConsumesQuota(t *testing.T) {
	t.Parallel()
	svc := New(Deps{
		Billing:      &stubBilling{usageErr: billingadapter.ErrQuotaExceeded},
		Runner:       runner.DefaultFakeRunner(),
		MaxCodeBytes: 1024,
	}).(*sandboxService)

	_, err := svc.FormatCode(context.Background(), FormatCodeInput{
		UserID:   "user-1",
		Language: "go",
		Code:     "package main",
	})
	if err != ErrQuotaExceeded {
		t.Fatalf("expected format quota exceeded, got %v", err)
	}
}
