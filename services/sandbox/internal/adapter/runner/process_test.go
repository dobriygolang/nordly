package runner

import (
	"context"
	"os/exec"
	"testing"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/stretchr/testify/require"
)

func TestProcessRunnerSeparatesSyntaxChecksFromRuntimeErrors(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name        string
		executable  string
		language    model.Language
		compileCode string
		runtimeCode string
	}{
		{
			name:        "python",
			executable:  "python3",
			language:    model.LangPython,
			compileCode: "def broken(:\n    pass\n",
			runtimeCode: "raise SyntaxError('runtime-created')\n",
		},
		{
			name:        "javascript",
			executable:  "node",
			language:    model.LangJavaScript,
			compileCode: "const = ;\n",
			runtimeCode: "throw new SyntaxError('runtime-created');\n",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if _, err := exec.LookPath(test.executable); err != nil {
				t.Skipf("%s is not installed", test.executable)
			}
			codeRunner := &ProcessRunner{MaxOutputBytes: 4096, MaxCodeBytes: 4096}

			compileResult, err := codeRunner.Run(context.Background(), RunRequest{
				Language:  test.language,
				Code:      test.compileCode,
				TimeoutMS: 2000,
				MemoryMB:  128,
			})
			require.NoError(t, err)
			require.Equal(t, model.StatusCompileError, compileResult.Status)
			require.NotEmpty(t, compileResult.CompileOutput)

			runtimeResult, err := codeRunner.Run(context.Background(), RunRequest{
				Language:  test.language,
				Code:      test.runtimeCode,
				TimeoutMS: 2000,
				MemoryMB:  128,
			})
			require.NoError(t, err)
			require.Equal(t, model.StatusRuntimeError, runtimeResult.Status)
			require.Empty(t, runtimeResult.CompileOutput)
			require.Contains(t, runtimeResult.Error, "runtime-created")
		})
	}
}
