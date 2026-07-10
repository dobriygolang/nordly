package jwt

import "testing"

func TestEditorRoomID(t *testing.T) {
	t.Parallel()
	room := "550e8400-e29b-41d4-a716-446655440000"
	got, ok := EditorRoomID("editor:" + room)
	if !ok || got != room {
		t.Fatalf("EditorRoomID() = %q, %v; want %q, true", got, ok, room)
	}
	if _, ok := EditorRoomID(""); ok {
		t.Fatal("empty scope should not match")
	}
	if _, ok := EditorRoomID("room:" + room); ok {
		t.Fatal("wrong prefix should not match")
	}
}
