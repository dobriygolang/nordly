package model_test

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

func TestPublicLiveRoomURL(t *testing.T) {
	roomID := uuid.MustParse("3d60b691-48f8-421a-bde6-43d073ab4245")
	got := model.PublicLiveRoomURL("https://trynordly.app", roomID)
	want := "https://trynordly.app/live/3d60b691-48f8-421a-bde6-43d073ab4245"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestLegacyInviteToken_roundTrip(t *testing.T) {
	secret := []byte("test-room-invite-secret")
	roomID := uuid.New()
	now := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

	token, exp, err := model.GenerateLegacyInviteToken(roomID, 24*time.Hour, secret, now)
	if err != nil {
		t.Fatal(err)
	}
	if token == "" {
		t.Fatal("expected token")
	}
	if !exp.After(now) {
		t.Fatalf("expiry %v should be after %v", exp, now)
	}

	got, err := model.ValidateLegacyInviteToken(token, secret, now.Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if got != roomID {
		t.Fatalf("room id %v want %v", got, roomID)
	}
}

func TestValidateLegacyInviteToken_rejectsExpired(t *testing.T) {
	secret := []byte("test-room-invite-secret")
	roomID := uuid.New()
	now := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

	token, _, err := model.GenerateLegacyInviteToken(roomID, time.Second, secret, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = model.ValidateLegacyInviteToken(token, secret, now.Add(2*time.Second))
	if !errors.Is(err, model.ErrInvalidInvite) {
		t.Fatalf("expected ErrInvalidInvite, got %v", err)
	}
}

func TestValidateLegacyInviteToken_rejectsBadSignature(t *testing.T) {
	secret := []byte("test-room-invite-secret")
	roomID := uuid.New()
	now := time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC)

	token, _, err := model.GenerateLegacyInviteToken(roomID, 24*time.Hour, secret, now)
	if err != nil {
		t.Fatal(err)
	}
	_, err = model.ValidateLegacyInviteToken(token, []byte("wrong-secret"), now)
	if !errors.Is(err, model.ErrInvalidInvite) {
		t.Fatalf("expected ErrInvalidInvite, got %v", err)
	}
}
