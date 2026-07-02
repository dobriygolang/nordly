package catalog

import "github.com/dobriygolang/project-nordly/services/billing/internal/billing/model"

// PublicPricingKeys are entitlements shown on GET /v1/billing/plans (pricing UI).
// Internal gates (code_runs_per_day, live_rooms_*) stay on the plan but are hidden here.
var PublicPricingKeys = map[string]struct{}{
	model.EntitlementCloudSyncEnabled:    {},
	model.EntitlementCloudSyncDevices:    {},
	model.EntitlementCloudNotesCount:     {},
	model.EntitlementPublishedNotesActive: {},
	model.EntitlementPublishUnlisted:     {},
	model.EntitlementPublishPassword:     {},
}

// PublicPricingView returns a catalog item with only pricing-visible entitlements.
func PublicPricingView(item PlanCatalogItem) PlanCatalogItem {
	out := PlanCatalogItem{
		Slug:      item.Slug,
		Name:      item.Name,
		Tagline:   item.Tagline,
		Highlight: item.Highlight,
		Features:  make(map[string]bool, len(item.Features)),
		Limits:    make(map[string]PlanLimitSpec, len(item.Limits)),
	}
	for k, v := range item.Features {
		if _, ok := PublicPricingKeys[k]; ok {
			out.Features[k] = v
		}
	}
	for k, v := range item.Limits {
		if _, ok := PublicPricingKeys[k]; ok {
			out.Limits[k] = v
		}
	}
	return out
}
