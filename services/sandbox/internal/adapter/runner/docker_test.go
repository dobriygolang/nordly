package runner

import (
	"strings"
	"testing"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

func TestDockerRunArgsHardening(t *testing.T) {
	t.Parallel()
	args, err := dockerRunArgs("sbx-1", "golang:alpine", "/tmp/work", "/var/lib/sandbox-work/gocache", 128, "1.5", "go", "run", "main.go")
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(args, " ")

	required := []string{
		"--network none",
		"--memory 128m",
		"--cpus 1.5",
		"--pids-limit 64",
		"--user ",
		"--cap-drop ALL",
		"--read-only",
		"--security-opt no-new-privileges",
		"--name sbx-1",
		"GOCACHE=/var/lib/sandbox-work/gocache",
		"/var/lib/sandbox-work/gocache:/var/lib/sandbox-work/gocache:rw",
	}
	for _, want := range required {
		if !strings.Contains(joined, want) {
			t.Fatalf("docker args missing %q; got: %s", want, joined)
		}
	}
	if args[len(args)-3] != "go" || args[len(args)-1] != "main.go" {
		t.Fatalf("command not appended correctly: %v", args)
	}
}

func TestDockerLanguageSpecMarksCompileAndRuntimePhases(t *testing.T) {
	t.Parallel()
	runner := &DockerRunner{
		GoImage:         "go",
		PythonImage:     "python",
		JavaScriptImage: "node",
	}
	for _, language := range []model.Language{model.LangGo, model.LangPython, model.LangJavaScript} {
		_, _, command, err := dockerLanguageSpec(language, runner, "compile-marker", "runtime-marker")
		if err != nil {
			t.Fatal(err)
		}
		script := strings.Join(command, " ")
		if !strings.Contains(script, "touch /work/compile-marker; exit 1") {
			t.Fatalf("%s script does not mark compile failures: %s", language, script)
		}
		if !strings.Contains(script, "touch /work/runtime-marker || exit 126") {
			t.Fatalf("%s script does not mark runtime start atomically: %s", language, script)
		}
	}
}
