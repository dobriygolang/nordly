package zoom

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

var ErrReauthRequired = errors.New("zoom reauthentication required")

// MeetingInput describes a Zoom meeting to create for a work task.
type MeetingInput struct {
	Topic    string
	Start    time.Time
	Duration int // minutes
}

// MeetingResult is the normalized create-meeting response.
type MeetingResult struct {
	ID      string
	JoinURL string
}

type createMeetingRequest struct {
	Topic     string `json:"topic"`
	Type      int    `json:"type"`
	StartTime string `json:"start_time,omitempty"`
	Duration  int    `json:"duration,omitempty"`
	Timezone  string `json:"timezone,omitempty"`
}

type createMeetingResponse struct {
	ID      json.Number `json:"id"`
	JoinURL string      `json:"join_url"`
}

// CreateMeeting creates a Zoom meeting on behalf of the connected user.
func (c *Client) CreateMeeting(ctx context.Context, refreshToken string, in MeetingInput) (MeetingResult, error) {
	if !c.Configured() {
		return MeetingResult{}, fmt.Errorf("zoom not configured")
	}
	tok, err := c.TokenSource(ctx, refreshToken).Token()
	if err != nil {
		return MeetingResult{}, classifyErr(fmt.Errorf("zoom token: %w", err))
	}

	topic := strings.TrimSpace(in.Topic)
	if topic == "" {
		topic = "Nordly meeting"
	}

	reqBody := createMeetingRequest{
		Topic:    topic,
		Type:     2,
		Timezone: "UTC",
	}
	if in.Duration > 0 {
		reqBody.Duration = in.Duration
	} else {
		reqBody.Duration = 30
	}
	if !in.Start.IsZero() {
		reqBody.StartTime = in.Start.UTC().Format("2006-01-02T15:04:05Z")
	} else {
		reqBody.Type = 1
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return MeetingResult{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.zoom.us/v2/users/me/meetings", bytes.NewReader(payload))
	if err != nil {
		return MeetingResult{}, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return MeetingResult{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return MeetingResult{}, ErrReauthRequired
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return MeetingResult{}, fmt.Errorf("zoom create meeting: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var out createMeetingResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return MeetingResult{}, fmt.Errorf("zoom create meeting decode: %w", err)
	}
	if out.JoinURL == "" {
		return MeetingResult{}, fmt.Errorf("zoom create meeting: empty join_url")
	}
	return MeetingResult{
		ID:      out.ID.String(),
		JoinURL: out.JoinURL,
	}, nil
}

func classifyErr(err error) error {
	if err == nil {
		return nil
	}
	var re *oauth2.RetrieveError
	if errors.As(err, &re) {
		return ErrReauthRequired
	}
	return err
}
