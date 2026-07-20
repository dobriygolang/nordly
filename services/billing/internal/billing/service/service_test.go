package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"maps"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	identityadapter "github.com/dobriygolang/project-nordly/services/billing/internal/adapter/identity"
	identitymocks "github.com/dobriygolang/project-nordly/services/billing/internal/adapter/identity/mocks"
	"github.com/dobriygolang/project-nordly/services/billing/internal/adapter/providers"
	"github.com/dobriygolang/project-nordly/services/billing/internal/adapter/providers/tribute"
	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/cache"
	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/model"
	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/repository"
	repomocks "github.com/dobriygolang/project-nordly/services/billing/internal/billing/repository/mocks"
)

type billingFixture struct {
	plan         *model.Plan
	entitlements []model.PlanEntitlement
	usage        map[string]int
	releaseDedup map[string]struct{}
	releaseErr   error
	cancelCalled bool
	lastSub      *model.Subscription
}

func newBillingStore(t *testing.T, f *billingFixture) *repomocks.Store {
	t.Helper()
	if f.usage == nil {
		f.usage = map[string]int{}
	}
	if f.releaseDedup == nil {
		f.releaseDedup = map[string]struct{}{}
	}
	store := repomocks.NewStore(t)

	store.EXPECT().ListActivePlans(mock.Anything).RunAndReturn(func(context.Context) ([]model.Plan, error) {
		if f.plan == nil {
			return nil, nil
		}
		return []model.Plan{*f.plan}, nil
	}).Maybe()
	store.EXPECT().ListPlanEntitlements(mock.Anything, mock.Anything).RunAndReturn(
		func(context.Context, string) ([]model.PlanEntitlement, error) {
			return f.entitlements, nil
		},
	).Maybe()
	store.EXPECT().GetPlanBySlug(mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, slug string) (*model.Plan, error) {
			if f.plan != nil && f.plan.Slug == slug {
				return f.plan, nil
			}
			return nil, repository.ErrNotFound
		},
	).Maybe()
	store.EXPECT().GetPlanByID(mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, id string) (*model.Plan, error) {
			if f.plan != nil && f.plan.ID == id {
				return f.plan, nil
			}
			return nil, repository.ErrNotFound
		},
	).Maybe()
	store.EXPECT().WithTx(mock.Anything, mock.Anything).RunAndReturn(
		func(ctx context.Context, fn func(context.Context) error) error {
			usageBefore := maps.Clone(f.usage)
			dedupBefore := maps.Clone(f.releaseDedup)
			if err := fn(ctx); err != nil {
				f.usage = usageBefore
				f.releaseDedup = dedupBefore
				return err
			}
			return nil
		},
	).Maybe()
	store.EXPECT().GetUsage(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, _, key string, _, _ time.Time) (int, error) {
			return f.usage[key], nil
		},
	).Maybe()
	store.EXPECT().ConsumeUsage(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, _, key string, _, _ time.Time, amount, limit int) (int, error) {
			next := f.usage[key] + amount
			if next > limit {
				return f.usage[key], repository.ErrLimitExceeded
			}
			f.usage[key] = next
			return next, nil
		},
	).Maybe()
	store.EXPECT().ConsumeUsageUnlimited(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, _, key string, _, _ time.Time, amount int) (int, error) {
			f.usage[key] += amount
			return f.usage[key], nil
		},
	).Maybe()
	store.EXPECT().ReleaseUsage(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, _, key string, _, _ time.Time, amount int) (int, error) {
			if f.releaseErr != nil {
				return 0, f.releaseErr
			}
			f.usage[key] -= amount
			if f.usage[key] < 0 {
				f.usage[key] = 0
			}
			return f.usage[key], nil
		},
	).Maybe()
	store.EXPECT().MarkUsageReleaseProcessed(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, idempotencyKey, _, _ string, _ int) (bool, error) {
			if _, ok := f.releaseDedup[idempotencyKey]; ok {
				return false, nil
			}
			f.releaseDedup[idempotencyKey] = struct{}{}
			return true, nil
		},
	).Maybe()
	store.EXPECT().CancelActiveSubscriptions(mock.Anything, mock.Anything).RunAndReturn(
		func(context.Context, string) error {
			f.cancelCalled = true
			return nil
		},
	).Maybe()
	store.EXPECT().UpsertSubscription(mock.Anything, mock.Anything).RunAndReturn(
		func(_ context.Context, sub *model.Subscription) error {
			copy := *sub
			f.lastSub = &copy
			return nil
		},
	).Maybe()
	store.EXPECT().UpsertProviderAccount(mock.Anything, mock.Anything).Return(nil).Maybe()
	store.EXPECT().GetProviderAccount(mock.Anything, mock.Anything, mock.Anything).
		Return(nil, repository.ErrNotFound).Maybe()
	store.EXPECT().MarkProviderEventProcessed(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return(true, nil).Maybe()
	store.EXPECT().FindSubscriptionByProviderRef(mock.Anything, mock.Anything, mock.Anything).
		Return(nil, repository.ErrNotFound).Maybe()
	store.EXPECT().HasUsedProTrial(mock.Anything, mock.Anything).Return(false, nil).Maybe()
	store.EXPECT().UpdatePlanEntitlement(mock.Anything, mock.Anything, mock.Anything, mock.Anything).Return(nil).Maybe()
	return store
}

func newTestService(t *testing.T, f *billingFixture) Service {
	t.Helper()
	store := newBillingStore(t, f)
	plans := cache.NewPlans(store)
	require.NoError(t, plans.Reload(context.Background()))
	return New(Deps{
		Repo:       store,
		PlansCache: plans,
		TierToPlan: map[string]string{"tribute_default": model.PlanDefault},
	})
}

func TestGetCurrentPlanDefaultsToDefault(t *testing.T) {
	t.Parallel()
	f := &billingFixture{plan: &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"}}
	plan, err := newTestService(t, f).GetCurrentPlan(context.Background(), "user-1")
	require.NoError(t, err)
	require.Equal(t, model.PlanDefault, plan.Slug)
}

func TestCheckEntitlementBool(t *testing.T) {
	t.Parallel()
	f := &billingFixture{
		plan: &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"},
		entitlements: []model.PlanEntitlement{
			{Key: "beta_feature", ValueJSON: json.RawMessage(`{"type":"bool","value":false}`)},
		},
	}
	res, err := newTestService(t, f).CheckEntitlement(context.Background(), "user-1", "beta_feature")
	require.NoError(t, err)
	require.False(t, res.Allowed)
}

func TestCheckAndConsumeUsageIncrements(t *testing.T) {
	t.Parallel()
	f := &billingFixture{
		plan:  &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"},
		usage: map[string]int{},
		entitlements: []model.PlanEntitlement{
			{Key: model.EntitlementCodeRunsPerDay, ValueJSON: json.RawMessage(`{"type":"counter","limit":5,"period":"day"}`)},
		},
	}
	res, err := newTestService(t, f).CheckAndConsumeUsage(context.Background(), "user-1", model.EntitlementCodeRunsPerDay, 1)
	require.NoError(t, err)
	require.True(t, res.Allowed)
	require.Equal(t, 1, res.Used)
}

func TestCheckAndConsumeUsageRejectsOverLimit(t *testing.T) {
	t.Parallel()
	f := &billingFixture{
		plan:  &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"},
		usage: map[string]int{model.EntitlementCodeRunsPerDay: 5},
		entitlements: []model.PlanEntitlement{
			{Key: model.EntitlementCodeRunsPerDay, ValueJSON: json.RawMessage(`{"type":"counter","limit":5,"period":"day"}`)},
		},
	}
	res, err := newTestService(t, f).CheckAndConsumeUsage(context.Background(), "user-1", model.EntitlementCodeRunsPerDay, 1)
	require.NoError(t, err)
	require.False(t, res.Allowed)
	require.Equal(t, "limit_exceeded", res.Reason)
	require.Equal(t, 5, f.usage[model.EntitlementCodeRunsPerDay])
}

func TestReleaseUsageDecrementsConsumedQuota(t *testing.T) {
	t.Parallel()
	f := &billingFixture{
		plan:  &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"},
		usage: map[string]int{model.EntitlementCodeRunsPerDay: 3},
		entitlements: []model.PlanEntitlement{
			{Key: model.EntitlementCodeRunsPerDay, ValueJSON: json.RawMessage(`{"type":"counter","limit":5,"period":"day"}`)},
		},
	}
	svc := newTestService(t, f)
	res, err := svc.ReleaseUsage(context.Background(), "user-1", model.EntitlementCodeRunsPerDay, "attempt-1", 1)
	require.NoError(t, err)
	require.True(t, res.Released)
	require.Equal(t, 2, res.Used)

	res2, err := svc.ReleaseUsage(context.Background(), "user-1", model.EntitlementCodeRunsPerDay, "attempt-1", 1)
	require.NoError(t, err)
	require.True(t, res2.Released)
	require.Equal(t, "already_released", res2.Reason)
	require.Equal(t, 2, f.usage[model.EntitlementCodeRunsPerDay])
}

func TestReleaseUsageRollsBackClaimWhenDecrementFails(t *testing.T) {
	t.Parallel()
	releaseErr := errors.New("decrement failed")
	f := &billingFixture{
		plan:       &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"},
		usage:      map[string]int{model.EntitlementCodeRunsPerDay: 3},
		releaseErr: releaseErr,
		entitlements: []model.PlanEntitlement{
			{Key: model.EntitlementCodeRunsPerDay, ValueJSON: json.RawMessage(`{"type":"counter","limit":5,"period":"day"}`)},
		},
	}
	_, err := newTestService(t, f).ReleaseUsage(context.Background(), "user-1", model.EntitlementCodeRunsPerDay, "attempt-1", 1)
	require.ErrorIs(t, err, releaseErr)
	_, claimed := f.releaseDedup["attempt-1"]
	require.False(t, claimed)
	require.Equal(t, 3, f.usage[model.EntitlementCodeRunsPerDay])
}

func TestGrantSubscriptionCreatesActiveSub(t *testing.T) {
	t.Parallel()
	f := &billingFixture{plan: &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"}}
	sub, err := newTestService(t, f).GrantSubscription(context.Background(), "user-1", model.PlanDefault, nil)
	require.NoError(t, err)
	require.Equal(t, model.SubStatusActive, sub.Status)
	require.True(t, f.cancelCalled)
}

func TestTributeWebhookCreatesSubscription(t *testing.T) {
	t.Parallel()
	f := &billingFixture{plan: &model.Plan{ID: "default-id", Slug: model.PlanDefault, Name: "Nordly"}}
	store := newBillingStore(t, f)
	plans := cache.NewPlans(store)
	require.NoError(t, plans.Reload(context.Background()))

	identity := identitymocks.NewClient(t)
	identity.EXPECT().
		GetUserByTelegramID(mock.Anything, int64(12345)).
		Return(&identityadapter.User{ID: "user-1", Username: "tester"}, nil)

	provider := tribute.New(tribute.Config{WebhookSecret: "test-secret"})
	svc := New(Deps{
		Repo:       store,
		Identity:   identity,
		Providers:  []providers.BillingProvider{provider},
		PlansCache: plans,
		TierToPlan: map[string]string{"tribute_default": model.PlanDefault},
	})
	body := []byte(`{
		"event_id":"evt-1",
		"event_type":"subscription_created",
		"telegram_user_id":12345,
		"username":"tester",
		"subscription_id":"sub-1",
		"tier":"tribute_default",
		"status":"active"
	}`)
	headers := map[string]string{"trbt-signature": tributeHMAC("test-secret", body)}
	require.NoError(t, svc.HandleProviderWebhook(context.Background(), "tribute", headers, body))
	require.NotNil(t, f.lastSub)
	require.Equal(t, model.PlanDefault, f.lastSub.PlanSlug)
}

func tributeHMAC(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}
