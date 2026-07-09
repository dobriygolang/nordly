package catalog

import (
	"encoding/json"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/entitlement"
	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/model"
)

// PlanPresentation is marketing metadata stored in plans.metadata.
type PlanPresentation struct {
	Tagline   string `json:"tagline"`
	Highlight bool   `json:"highlight"`
}

// ParsePlanPresentation decodes plans.metadata JSON.
func ParsePlanPresentation(raw json.RawMessage) PlanPresentation {
	if len(raw) == 0 {
		return PlanPresentation{}
	}
	var out PlanPresentation
	_ = json.Unmarshal(raw, &out)
	return out
}

// PlanCatalogItem is a public plan card for pricing UI.
type PlanCatalogItem struct {
	Slug      string
	Name      string
	Tagline   string
	Highlight bool
	Features  map[string]bool
	Limits    map[string]PlanLimitSpec
}

// PlanLimitSpec is a static entitlement definition (no usage).
type PlanLimitSpec struct {
	Type      string
	Limit     *int
	Unlimited bool
	Period    string
	Value     bool
}

// BuildPlanCatalog assembles one pricing card from DB plan + entitlements.
func BuildPlanCatalog(plan model.Plan, items []model.PlanEntitlement) (PlanCatalogItem, error) {
	pres := ParsePlanPresentation(plan.Metadata)
	specs := make(map[string]PlanLimitSpec, len(items))
	features := make(map[string]bool, len(items))

	for _, item := range items {
		val, err := entitlement.Parse(item.ValueJSON)
		if err != nil {
			return PlanCatalogItem{}, fmt.Errorf("parse entitlement %q: %w", item.Key, err)
		}
		specs[item.Key] = toLimitSpec(val)
		if val.Type == entitlement.TypeBool {
			features[item.Key] = val.Value
		}
	}

	name := plan.Name

	tagline := pres.Tagline
	if tagline == "" && plan.Description != nil {
		tagline = *plan.Description
	}

	return PlanCatalogItem{
		Slug:      plan.Slug,
		Name:      name,
		Tagline:   tagline,
		Highlight: pres.Highlight,
		Features:  features,
		Limits:    specs,
	}, nil
}

func toLimitSpec(val entitlement.Value) PlanLimitSpec {
	spec := PlanLimitSpec{
		Type:      val.Type,
		Limit:     val.Limit,
		Unlimited: val.Limit == nil && (val.Type == entitlement.TypeCounter || val.Type == entitlement.TypeGauge),
		Period:    val.Period,
		Value:     val.Value,
	}
	if val.Type == entitlement.TypeBool {
		spec.Unlimited = false
	}
	return spec
}
