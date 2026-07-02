package catalog_test

import (
	"testing"

	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/catalog"
	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/model"
)

func TestPublicPricingViewHidesInternalEntitlements(t *testing.T) {
	t.Parallel()
	item := catalog.PlanCatalogItem{
		Slug: "free",
		Limits: map[string]catalog.PlanLimitSpec{
			model.EntitlementCloudNotesCount:   {Type: "gauge", Limit: intPtr(50)},
			model.EntitlementCodeRunsPerDay:    {Type: "counter", Unlimited: true},
			model.EntitlementLiveRoomsPerMonth: {Type: "counter", Unlimited: true},
		},
		Features: map[string]bool{
			model.EntitlementCloudSyncEnabled: false,
			model.EntitlementPublishUnlisted:  false,
		},
	}
	out := catalog.PublicPricingView(item)
	if _, ok := out.Limits[model.EntitlementCodeRunsPerDay]; ok {
		t.Fatal("code_runs should not appear in public pricing catalog")
	}
	if _, ok := out.Limits[model.EntitlementCloudNotesCount]; !ok {
		t.Fatal("cloud_notes_count should appear in public pricing catalog")
	}
	if !out.Features[model.EntitlementCloudSyncEnabled] {
		// false is a valid feature value
	} else {
		t.Fatal("expected cloud_sync_enabled false")
	}
}

func intPtr(n int) *int { return &n }
