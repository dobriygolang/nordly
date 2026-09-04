package runner

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/stretchr/testify/require"
)

func TestCappedWriterDrainsAfterLimit(t *testing.T) {
	t.Parallel()
	writer, err := newCappedWriter(32)
	require.NoError(t, err)
	payload := []byte(strings.Repeat("x", 4096))

	written, err := writer.Write(payload)
	require.NoError(t, err)
	require.Equal(t, len(payload), written)
	require.Len(t, writer.String(), 32)
	require.True(t, writer.Truncated())

	written, err = writer.Write(payload)
	require.NoError(t, err)
	require.Equal(t, len(payload), written)
	require.Len(t, writer.String(), 32)
}

func TestCombinedOutputHasOneTotalBound(t *testing.T) {
	t.Parallel()
	got, err := combineOutput(64, strings.Repeat("a", 50), strings.Repeat("b", 50))
	require.NoError(t, err)
	require.Len(t, got, 64)
	require.Contains(t, got, "[truncated]")
}

func TestLimitTextRejectsMissingBound(t *testing.T) {
	t.Parallel()
	_, err := LimitText("value", 0)
	require.Error(t, err)
}

func TestPythonAndJavaScriptUseSeparateSyntaxChecks(t *testing.T) {
	t.Parallel()
	_, _, pythonCompile, err := languageSpec(model.LangPython, t.TempDir())
	require.NoError(t, err)
	require.Equal(t, []string{"python3", "-m", "py_compile", "main.py"}, pythonCompile)
	_, _, javaScriptCompile, err := languageSpec(model.LangJavaScript, t.TempDir())
	require.NoError(t, err)
	require.Equal(t, []string{"node", "--check", "main.js"}, javaScriptCompile)

	dockerRunner := &DockerRunner{PythonImage: "python", JavaScriptImage: "node"}
	_, _, pythonCommand, err := dockerLanguageSpec(model.LangPython, dockerRunner, ".compile", ".runtime")
	require.NoError(t, err)
	require.Contains(t, pythonCommand[2], "python3 -m py_compile")
	_, _, javaScriptCommand, err := dockerLanguageSpec(model.LangJavaScript, dockerRunner, ".compile", ".runtime")
	require.NoError(t, err)
	require.Contains(t, javaScriptCommand[2], "node --check")
}

func TestExecutionTimeoutExcludesParentDeadline(t *testing.T) {
	t.Parallel()
	executionCtx, cancelExecution := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancelExecution()
	<-executionCtx.Done()
	require.True(t, executionTimedOut(context.Background(), executionCtx))

	parentCtx, cancelParent := context.WithTimeout(context.Background(), time.Millisecond)
	defer cancelParent()
	childCtx, cancelChild := context.WithTimeout(parentCtx, time.Minute)
	defer cancelChild()
	<-parentCtx.Done()
	require.False(t, executionTimedOut(parentCtx, childCtx))
}
