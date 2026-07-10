package service

import (
	"testing"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

func TestCanReadCodeRun(t *testing.T) {
	t.Parallel()
	room := "550e8400-e29b-41d4-a716-446655440000"
	run := &model.CodeRun{UserID: "owner", RoomID: room}

	if !canReadCodeRun(run, "owner", "") {
		t.Fatal("owner should read own run")
	}
	if !canReadCodeRun(run, "guest", "editor:"+room) {
		t.Fatal("room guest should read shared run")
	}
	if canReadCodeRun(run, "guest", "editor:other-room") {
		t.Fatal("guest in other room should not read run")
	}
	if canReadCodeRun(&model.CodeRun{UserID: "owner"}, "guest", "editor:"+room) {
		t.Fatal("legacy run without room_id should stay private")
	}
}
