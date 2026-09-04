package format_code_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/format_code"
)

func TestFormatCodeFormatsGo(t *testing.T) {
	t.Parallel()
	h, err := format_code.New(format_code.Config{
		Runner: runner.DefaultFakeRunner(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), format_code.Command{
		UserID:       "9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03",
		Language:     model.LangGo,
		Code:         "package main\n",
		MaxCodeBytes: 1024,
	})
	require.NoError(t, err)
	require.NotEmpty(t, got)
}

func TestFormatCodeRejectsNonGo(t *testing.T) {
	t.Parallel()
	h, err := format_code.New(format_code.Config{
		Runner: runner.DefaultFakeRunner(),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), format_code.Command{
		UserID:       "9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03",
		Language:     model.LangPython,
		Code:         "print(1)",
		MaxCodeBytes: 1024,
	})
	require.ErrorIs(t, err, model.ErrInvalidInput)
}
