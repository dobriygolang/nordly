package billingapi

import (
	"context"

	billingv1 "github.com/dobriygolang/project-nordly/services/billing/pkg/api/billing/v1"
)

// CheckAndConsumeUsage atomically checks and increments a usage counter.
func (i *Implementation) CheckAndConsumeUsage(ctx context.Context, req *billingv1.CheckAndConsumeUsageRequest) (*billingv1.CheckAndConsumeUsageResponse, error) {
	if req.GetUserId() == "" || req.GetKey() == "" {
		return nil, invalidArgument("user_id and key are required")
	}
	amount := int(req.GetAmount())
	if amount <= 0 {
		return nil, invalidArgument("amount must be positive")
	}
	result, err := i.svc.CheckAndConsumeUsage(ctx, req.GetUserId(), req.GetKey(), amount)
	if err != nil {
		return nil, mapServiceError(err)
	}
	resp := &billingv1.CheckAndConsumeUsageResponse{
		Allowed: result.Allowed,
		Used:    int32(result.Used),
		Reason:  result.Reason,
	}
	if result.Limit != nil {
		v := int32(*result.Limit)
		resp.Limit = &v
	}
	if result.Remaining != nil {
		v := int32(*result.Remaining)
		resp.Remaining = &v
	}
	return resp, nil
}
