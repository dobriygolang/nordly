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

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"golang.org/x/oauth2"
)

var ErrReauthRequired = model.ErrZoomReauthRequired

type MeetingInput = model.MeetingInput
type MeetingResult = model.Meeting

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
		return MeetingResult{}, fmt.Errorf("zoom meeting topic required")
	}

	reqBody := createMeetingRequest{
		Topic:    topic,
		Type:     2,
		Timezone: "UTC",
	}
	if in.DurationMin > 0 {
		reqBody.Duration = in.DurationMin
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
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return MeetingResult{}, fmt.Errorf("zoom create meeting read body: %w", err)
	}
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
	if out.ID.String() == "" {
		return MeetingResult{}, fmt.Errorf("zoom create meeting: empty id")
	}
	if out.JoinURL == "" {
		return MeetingResult{}, fmt.Errorf("zoom create meeting: empty join_url")
	}
	return MeetingResult{
		ID:      out.ID.String(),
		JoinURL: out.JoinURL,
	}, nil
}

// DeleteMeeting removes a Zoom meeting; already-deleted meetings are treated as success.
func (c *Client) DeleteMeeting(ctx context.Context, refreshToken, meetingID string) error {
	if !c.Configured() {
		return fmt.Errorf("zoom not configured")
	}
	id := strings.TrimSpace(meetingID)
	if id == "" {
		return fmt.Errorf("zoom meeting id required")
	}
	tok, err := c.TokenSource(ctx, refreshToken).Token()
	if err != nil {
		return classifyErr(fmt.Errorf("zoom token: %w", err))
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, "https://api.zoom.us/v2/meetings/"+id, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return ErrReauthRequired
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("zoom delete meeting: status %d", resp.StatusCode)
		}
		return fmt.Errorf("zoom delete meeting: status %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

func classifyErr(err error) error {
	if err == nil {
		return nil
	}
	var re *oauth2.RetrieveError
	if errors.As(err, &re) {
		body := strings.ToLower(string(re.Body))
		if strings.Contains(body, "invalid_grant") ||
			strings.Contains(body, "unauthorized_client") ||
			(re.Response != nil && re.Response.StatusCode == http.StatusUnauthorized) {
			return ErrReauthRequired
		}
	}
	return err
}
