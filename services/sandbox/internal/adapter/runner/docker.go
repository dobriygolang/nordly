package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/google/uuid"
)

// DockerRunner executes code in an isolated Docker container.
type DockerRunner struct {
	GoImage         string
	PythonImage     string
	JavaScriptImage string
	MaxOutputBytes  int
	MaxCodeBytes    int
	DefaultMemoryMB int
	CPUs            string
	// WorkRoot is a host-visible directory for bind mounts when sandbox uses
	// docker.sock from inside a container (must match a bind-mounted path).
	WorkRoot string
	// GoCacheDir is a host-visible persistent Go build cache.
	GoCacheDir string
}

func (r *DockerRunner) Name() string { return "docker" }

func (r *DockerRunner) Run(ctx context.Context, req RunRequest) (*RunResult, error) {
	start := time.Now()
	if r.MaxOutputBytes <= 0 {
		return nil, fmt.Errorf("docker runner: MaxOutputBytes must be > 0")
	}
	if !req.Language.IsValid() {
		return nil, fmt.Errorf("docker runner: unsupported language %q", req.Language)
	}
	if req.TimeoutMS <= 0 {
		return nil, fmt.Errorf("docker runner: TimeoutMS must be > 0")
	}
	if req.MemoryMB <= 0 {
		return nil, fmt.Errorf("docker runner: MemoryMB must be > 0")
	}
	if strings.TrimSpace(r.CPUs) == "" {
		return nil, fmt.Errorf("docker runner: CPUs must be set")
	}
	if strings.TrimSpace(r.WorkRoot) == "" {
		return nil, fmt.Errorf("docker runner: WorkRoot must be set")
	}

	if err := os.MkdirAll(r.WorkRoot, 0o700); err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(r.WorkRoot, "sandbox-docker-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(dir) }()

	compileMarker := ".compile-error-" + uuid.NewString()
	runtimeMarker := ".runtime-started-" + uuid.NewString()
	filename, image, cmd, err := dockerLanguageSpec(req.Language, r, compileMarker, runtimeMarker)
	if err != nil {
		return &RunResult{Status: model.StatusInternalError, Error: err.Error(), RunnerName: r.Name()}, nil
	}
	if err := os.WriteFile(filepath.Join(dir, filename), []byte(req.Code), 0o600); err != nil {
		return nil, err
	}
	if isGoLanguage(req.Language) {
		if err := prepareGoWorkspace(dir); err != nil {
			return nil, err
		}
	}

	timeout := time.Duration(req.TimeoutMS) * time.Millisecond
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	containerName := "sbx-" + uuid.NewString()
	// Removing the named container prevents orphans when the Docker CLI is
	// terminated before --rm can finish.
	defer removeContainer(containerName)

	args, err := dockerRunArgs(containerName, image, dir, goCacheDirForRun(r, req.Language), req.MemoryMB, r.CPUs, cmd...)
	if err != nil {
		return nil, err
	}
	command := commandContext(runCtx, "docker", args...)
	command.Stdin = strings.NewReader(req.Stdin)

	stdout, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return nil, err
	}
	stderr, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return nil, err
	}
	command.Stdout = stdout
	command.Stderr = stderr
	runErr := command.Run()

	res := &RunResult{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		TimeMS:     int(time.Since(start).Milliseconds()),
		RunnerName: r.Name(),
	}

	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if executionTimedOut(ctx, runCtx) {
		res.Status = model.StatusTimeout
		return res, nil
	}
	if runErr != nil {
		var startErr *exec.Error
		if errors.As(runErr, &startErr) {
			return nil, fmt.Errorf("start Docker runtime: %w", runErr)
		}
		combined, err := combineOutput(r.MaxOutputBytes, res.Stdout, res.Stderr)
		if err != nil {
			return nil, err
		}
		combined = strings.TrimSpace(combined)
		compileFailed, err := pathExists(filepath.Join(dir, compileMarker))
		if err != nil {
			return nil, fmt.Errorf("inspect compile marker: %w", err)
		}
		runtimeStarted, err := pathExists(filepath.Join(dir, runtimeMarker))
		if err != nil {
			return nil, fmt.Errorf("inspect runtime marker: %w", err)
		}
		if compileFailed {
			res.Status = model.StatusCompileError
			res.CompileOutput = combined
			return res, nil
		}
		if !runtimeStarted {
			if combined == "" {
				combined, err = LimitText(runErr.Error(), r.MaxOutputBytes)
				if err != nil {
					return nil, err
				}
			}
			return nil, fmt.Errorf("docker runtime failed: %s", combined)
		}
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			code := exitErr.ExitCode()
			res.ExitCode = &code
		}
		res.Status = model.StatusRuntimeError
		if msg := strings.TrimSpace(res.Stderr); msg != "" {
			res.Error, err = LimitText(msg, r.MaxOutputBytes)
		} else {
			res.Error, err = LimitText(runErr.Error(), r.MaxOutputBytes)
		}
		if err != nil {
			return nil, err
		}
		return res, nil
	}
	code := 0
	res.ExitCode = &code
	res.Status = model.StatusSuccess
	return res, nil
}

func goCacheDirForRun(r *DockerRunner, language model.Language) string {
	if !isGoLanguage(language) || r.GoCacheDir == "" {
		return ""
	}
	return r.GoCacheDir
}

func dockerRunArgs(name, image, workDir, goCacheDir string, memoryMB int, cpus string, cmd ...string) ([]string, error) {
	if memoryMB <= 0 {
		return nil, fmt.Errorf("dockerRunArgs: memoryMB must be > 0")
	}
	if strings.TrimSpace(cpus) == "" {
		return nil, fmt.Errorf("dockerRunArgs: cpus must be set")
	}
	mem := fmt.Sprintf("%dm", memoryMB)
	gocacheEnv := "/work/.gocache"
	if goCacheDir != "" {
		gocacheEnv = goCacheDir
	}
	args := []string{
		"run", "--rm", "-i",
		"--name", name,
		"--network", "none",
		"--memory", mem,
		"--memory-swap", mem,
		"--cpus", cpus,
		"--pids-limit", "64",
		"--user", fmt.Sprintf("%d:%d", os.Getuid(), os.Getgid()),
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		// Read-only root with a small writable tmpfs; the code dir is the only
		// rw bind mount. Caches are redirected there so compilers can run.
		"--read-only",
		"--tmpfs", "/tmp:rw,size=64m,exec",
		"-e", "HOME=/work",
		"-e", "GOCACHE=" + gocacheEnv,
		"-v", workDir + ":/work:rw",
	}
	if goCacheDir != "" {
		args = append(args, "-v", goCacheDir+":"+goCacheDir+":rw")
	}
	args = append(args, "-w", "/work", image)
	return append(args, cmd...), nil
}

// removeContainer best-effort force-removes a container that may have outlived
// the Docker CLI process.
func removeContainer(name string) {
	killCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = commandContext(killCtx, "docker", "rm", "-f", name).Run()
}

func dockerLanguageSpec(
	language model.Language,
	r *DockerRunner,
	compileMarker string,
	runtimeMarker string,
) (filename, image string, cmd []string, err error) {
	markCompileError := fmt.Sprintf("touch /work/%s; exit 1", compileMarker)
	markRuntimeStarted := fmt.Sprintf("touch /work/%s || exit 126", runtimeMarker)
	switch language {
	case model.LangGo:
		script := fmt.Sprintf(
			"go build -o /tmp/program main.go || { %s; }; %s; exec /tmp/program",
			markCompileError,
			markRuntimeStarted,
		)
		return "main.go", r.GoImage, []string{"sh", "-c", script}, nil
	case model.LangPython:
		script := fmt.Sprintf(
			"python3 -m py_compile main.py || { %s; }; %s; exec python3 main.py",
			markCompileError,
			markRuntimeStarted,
		)
		return "main.py", r.PythonImage, []string{"sh", "-c", script}, nil
	case model.LangJavaScript:
		script := fmt.Sprintf(
			"node --check main.js || { %s; }; %s; exec node main.js",
			markCompileError,
			markRuntimeStarted,
		)
		return "main.js", r.JavaScriptImage, []string{"sh", "-c", script}, nil
	default:
		return "", "", nil, fmt.Errorf("unsupported language: %s", language)
	}
}

func pathExists(path string) (bool, error) {
	_, err := os.Stat(path)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return false, err
}
