package billinggrpc

import (
	"context"
	"fmt"

	billingadapter "github.com/dobriygolang/project-nordly/services/identity/internal/adapter/billing"
	billingv1 "github.com/dobriygolang/project-nordly/services/billing/pkg/api/billing/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const internalTokenHeader = "x-internal-token"

type Client struct {
	client billingv1.BillingInternalServiceClient
	conn   *grpc.ClientConn
	token  string
}

func NewClient(ctx context.Context, addr, token string) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("dial billing grpc: %w", err)
	}
	if err := ctx.Err(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &Client{
		client: billingv1.NewBillingInternalServiceClient(conn),
		conn:   conn,
		token:  token,
	}, nil
}

func (c *Client) Close() error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Close()
}

func (c *Client) authCtx(ctx context.Context) context.Context {
	return metadata.AppendToOutgoingContext(ctx, internalTokenHeader, c.token)
}

func (c *Client) CheckFeature(ctx context.Context, userID, key string) (bool, error) {
	resp, err := c.client.GetEntitlements(c.authCtx(ctx), &billingv1.GetEntitlementsRequest{UserId: userID})
	if err != nil {
		return false, err
	}
	ent := resp.GetEntitlements()
	if ent == nil {
		return false, fmt.Errorf("billing: no entitlements for user %s", userID)
	}
	val, ok := ent.Features[key]
	if !ok {
		return false, fmt.Errorf("billing: feature %q not configured", key)
	}
	return val, nil
}

func (c *Client) GetGaugeLimit(ctx context.Context, userID, key string) (billingadapter.GaugeLimit, error) {
	resp, err := c.client.GetEntitlements(c.authCtx(ctx), &billingv1.GetEntitlementsRequest{UserId: userID})
	if err != nil {
		return billingadapter.GaugeLimit{}, err
	}
	ent := resp.GetEntitlements()
	if ent == nil {
		return billingadapter.GaugeLimit{}, fmt.Errorf("billing: no entitlements for user %s", userID)
	}
	lim, ok := ent.Limits[key]
	if !ok {
		return billingadapter.GaugeLimit{}, fmt.Errorf("billing: entitlement %q not configured", key)
	}
	if lim.GetUnlimited() {
		return billingadapter.GaugeLimit{Unlimited: true}, nil
	}
	if lim.Limit != nil {
		v := int(lim.GetLimit())
		return billingadapter.GaugeLimit{Limit: &v}, nil
	}
	return billingadapter.GaugeLimit{}, fmt.Errorf("billing: entitlement %q has no limit", key)
}

var _ billingadapter.Client = (*Client)(nil)
