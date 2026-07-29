package support_test

import (
	"testing"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

func TestSanitizeTestResultsRedactsHiddenFailures(t *testing.T) {
	t.Parallel()
	expected := "secret"
	actual := "wrong"
	results := support.SanitizeTestResults([]model.TestResult{{
		Name: "hidden test 1", Status: model.TestStatusFailed,
		ExpectedOutput: &expected, ActualOutput: &actual,
	}})
	if results[0].ExpectedOutput != nil || results[0].ActualOutput != nil {
		t.Fatalf("hidden failed test should not leak outputs")
	}
}

func TestCanReadCodeRun(t *testing.T) {
	t.Parallel()
	room := "550e8400-e29b-41d4-a716-446655440000"
	run := &model.CodeRun{UserID: "owner", RoomID: room}

	if !support.CanReadCodeRun(run, "owner", "") {
		t.Fatal("owner should read own run")
	}
	if !support.CanReadCodeRun(run, "guest", "editor:"+room) {
		t.Fatal("room guest should read shared run")
	}
	if support.CanReadCodeRun(run, "guest", "editor:other-room") {
		t.Fatal("guest in other room should not read run")
	}
	if support.CanReadCodeRun(&model.CodeRun{UserID: "owner"}, "guest", "editor:"+room) {
		t.Fatal("legacy run without room_id should stay private")
	}
}

func TestFakeRunnerCustomRun(t *testing.T) {
	t.Parallel()
	r := runner.DefaultFakeRunner()
	res, err := r.Run(t.Context(), runner.RunRequest{Language: model.LangPython, Code: "print(1)", Stdin: "hello"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Status != model.StatusSuccess || res.Stdout != "hello" {
		t.Fatalf("unexpected fake result: %+v", res)
	}
}

func TestFakeRunnerHiddenFailureRedaction(t *testing.T) {
	t.Parallel()
	r := runner.DefaultFakeRunner()
	res, err := r.Run(t.Context(), runner.RunRequest{
		Language: model.LangGo,
		Code:     "package main",
		Tests: []runner.TestCase{{
			Name: "hidden: edge", Input: "bad", ExpectedOutput: "good", IsHidden: true,
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.TestResults) != 1 {
		t.Fatalf("expected one test result")
	}
	if res.TestResults[0].ExpectedOutput != nil || res.TestResults[0].ActualOutput != nil {
		t.Fatalf("hidden test outputs must be redacted")
	}
}
