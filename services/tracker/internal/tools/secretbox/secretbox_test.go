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
	got, err := c.Open(sealed)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if got != "refresh-token-123" {
		t.Fatalf("got %q, want original", got)
	}
}

func TestEmptyKeyRejected(t *testing.T) {
	if _, err := New(""); err == nil {
		t.Fatal("expected error for empty key")
	}
}

func TestPlaintextAtRestRejected(t *testing.T) {
	c, err := New(newKey(t))
	if err != nil {
		t.Fatalf("new: %v", err)
	}
	if _, err := c.Open("legacy-plaintext-token"); err == nil {
		t.Fatal("expected error opening unencrypted token")
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
