package service

import (
	"context"
	"errors"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
)

func (s *sandboxService) gateCodeRun(ctx context.Context, userID string) error {
	if s.billing == nil {
		return nil
	}
	if err := s.billing.CheckAndConsumeUsage(ctx, userID, billingadapter.EntitlementCodeRunsPerDay, 1); err != nil {
		if errors.Is(err, billingadapter.ErrQuotaExceeded) {
			return ErrQuotaExceeded
		}
		return err
	}
	return nil
}
