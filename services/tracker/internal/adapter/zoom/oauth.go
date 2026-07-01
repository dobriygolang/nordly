package zoom

import (
	"context"
	"fmt"

	"golang.org/x/oauth2"
)

const (
	meetingWriteScope = "meeting:write:meeting"
	userReadScope     = "user:read:user"
)

// Client wraps Zoom OAuth for meeting creation.
type Client struct {
	config *oauth2.Config
}

// NewClient builds a Zoom OAuth client. Returns nil when not configured.
func NewClient(clientID, clientSecret, redirectURI string) *Client {
	if clientID == "" || clientSecret == "" || redirectURI == "" {
		return nil
	}
	return &Client{
		config: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURI,
			Scopes:       []string{meetingWriteScope, userReadScope},
			Endpoint: oauth2.Endpoint{
				AuthURL:  "https://zoom.us/oauth/authorize",
				TokenURL: "https://zoom.us/oauth/token",
			},
		},
	}
}

// Configured reports whether OAuth is available.
func (c *Client) Configured() bool {
	return c != nil && c.config != nil
}

// AuthURL returns the browser authorization URL for offline refresh tokens.
func (c *Client) AuthURL(state string) string {
	return c.config.AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce)
}

// ExchangeCode trades an authorization code for a long-lived refresh token.
func (c *Client) ExchangeCode(ctx context.Context, code string) (string, error) {
	tok, err := c.config.Exchange(ctx, code)
	if err != nil {
		return "", fmt.Errorf("exchange zoom code: %w", err)
	}
	if tok.RefreshToken == "" {
		return "", fmt.Errorf("zoom oauth: empty refresh token")
	}
	return tok.RefreshToken, nil
}

// TokenSource returns an oauth2 token source backed by a refresh token.
func (c *Client) TokenSource(ctx context.Context, refreshToken string) oauth2.TokenSource {
	return c.config.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
}
