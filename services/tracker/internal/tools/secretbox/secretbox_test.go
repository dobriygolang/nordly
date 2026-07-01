package secretbox

import (
	"crypto/rand"
	"encoding/base64"
	"strings"
	"testing"
)

func newKey(t *testing.T) string {
	t.Helper()
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		t.Fatalf("rand: %v", err)
	}
	return base64.StdEncoding.EncodeToString(b)
}

func TestRoundTrip(t *testing.T) {
	c, err := New(newKey(t))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	sealed, err := c.Seal("refresh-token-123")
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if !strings.HasPrefix(sealed, prefix) {
		t.Fatalf("sealed value missing prefix: %q", sealed)
	}
	if sealed == "refresh-token-123" {
		t.Fatal("value was not encrypted")
	}
	got, err := c.Open(sealed)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if got != "refresh-token-123" {
		t.Fatalf("got %q, want original", got)
	}
}

func TestNilCipherPassthrough(t *testing.T) {
	c, err := New("")
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	if c != nil {
		t.Fatal("empty key should yield nil cipher")
	}
	sealed, err := c.Seal("plain")
	if err != nil || sealed != "plain" {
		t.Fatalf("nil seal = %q, %v", sealed, err)
	}
	got, err := c.Open("plain")
	if err != nil || got != "plain" {
		t.Fatalf("nil open = %q, %v", got, err)
	}
}

func TestOpenLegacyPlaintext(t *testing.T) {
	c, err := New(newKey(t))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	// A value stored before encryption was enabled has no prefix and must
	// round-trip unchanged.
	got, err := c.Open("legacy-plaintext-token")
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	if got != "legacy-plaintext-token" {
		t.Fatalf("legacy open = %q", got)
	}
}

func TestWrongKeyFails(t *testing.T) {
	c1, _ := New(newKey(t))
	c2, _ := New(newKey(t))
	sealed, err := c1.Seal("secret")
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if _, err := c2.Open(sealed); err == nil {
		t.Fatal("expected open with wrong key to fail")
	}
}

func TestInvalidKey(t *testing.T) {
	if _, err := New("not-base64!!!"); err == nil {
		t.Fatal("expected error for invalid base64 key")
	}
	if _, err := New(base64.StdEncoding.EncodeToString([]byte("short"))); err == nil {
		t.Fatal("expected error for wrong-length key")
	}
}
