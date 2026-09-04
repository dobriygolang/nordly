package identitygrpc

import (
	"context"
	"fmt"
	"strings"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	identityadapter "github.com/dobriygolang/project-nordly/services/rooms/internal/adapter/identity"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

const internalTokenHeader = "x-internal-token"

// IdentityClient is the scoped-token RPC surface used by the adapter.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=IdentityClient --output=./mocks --outpkg=mocks --filename=identity_client.go
type IdentityClient interface {
	MintScopedAccessToken(
		ctx context.Context,
		in *identityv1.MintScopedAccessTokenRequest,
		opts ...grpc.CallOption,
	) (*identityv1.MintScopedAccessTokenResponse, error)
}

type Client struct {
	client IdentityClient
	conn   *grpc.ClientConn
	token  string
}

func NewClient(ctx context.Context, addr, token string) (*Client, error) {
	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("dial identity grpc: %w", err)
	}
	if err := ctx.Err(); err != nil {
		_ = conn.Close()
		return nil, err
	}
	return &Client{
		client: identityv1.NewIdentityServiceClient(conn),
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

func scopedRoleToProto(role model.ScopedRole) (identityv1.ScopedRole, error) {
	switch role {
	case model.ScopedRoleGuest:
		return identityv1.ScopedRole_SCOPED_ROLE_GUEST, nil
	case model.ScopedRoleOwner:
		return identityv1.ScopedRole_SCOPED_ROLE_OWNER, nil
	default:
		return identityv1.ScopedRole_SCOPED_ROLE_UNSPECIFIED, fmt.Errorf("unsupported scoped role %q", role)
	}
}

func (c *Client) MintScopedAccessToken(
	ctx context.Context,
	role model.ScopedRole,
	scope, displayName string,
	ttlSeconds int32,
	userID string,
) (string, error) {
	scopedRole, err := scopedRoleToProto(role)
	if err != nil {
		return "", err
	}
	expectedUserID, err := uuid.Parse(userID)
	if err != nil {
		return "", fmt.Errorf("mint scoped token user id: %w", err)
	}
	resp, err := c.client.MintScopedAccessToken(c.authCtx(ctx), &identityv1.MintScopedAccessTokenRequest{
		Role:        scopedRole,
		Scope:       scope,
		DisplayName: displayName,
		TtlSeconds:  ttlSeconds,
		UserId:      userID,
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(resp.GetAccessToken()) == "" {
		return "", fmt.Errorf("mint scoped token: identity returned an empty access token")
	}
	mintedUserID, err := uuid.Parse(resp.GetUserId())
	if err != nil {
		return "", fmt.Errorf("mint scoped token response user id: %w", err)
	}
	if mintedUserID != expectedUserID {
		return "", fmt.Errorf(
			"mint scoped token subject mismatch: requested %s, received %s",
			expectedUserID,
			mintedUserID,
		)
	}
	return resp.GetAccessToken(), nil
}

var _ identityadapter.TokenMinter = (*Client)(nil)
