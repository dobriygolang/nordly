package model

import "testing"

func TestParseWorkStatus(t *testing.T) {
	t.Parallel()
	got, ok := ParseWorkStatus(" done ")
	if !ok || !got.IsDone() {
		t.Fatalf("ParseWorkStatus(done) = %q, %v", got, ok)
	}
	if _, ok := ParseWorkStatus("blocked"); ok {
		t.Fatal("expected invalid status")
	}
}

func TestParseWorkKind(t *testing.T) {
	t.Parallel()
	got, ok := ParseWorkKind("custom")
	if !ok || got != WorkKindCustom {
		t.Fatalf("ParseWorkKind(custom) = %q, %v", got, ok)
	}
	if _, ok := ParseWorkKind("algo"); ok {
		t.Fatal("expected invalid kind")
	}
}

func TestParseConferenceProvider(t *testing.T) {
	t.Parallel()
	got, ok := ParseConferenceProvider("MEET")
	if !ok || got != ConferenceProviderMeet {
		t.Fatalf("ParseConferenceProvider(MEET) = %q, %v", got, ok)
	}
}
