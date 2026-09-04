package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEnumScansRejectUnknownPersistedValues(t *testing.T) {
	t.Parallel()
	var status RunStatus
	require.Error(t, status.Scan("failed"))
	var language Language
	require.Error(t, language.Scan("py"))
}

func TestRunStatusTransitionsAreClosed(t *testing.T) {
	t.Parallel()
	require.True(t, StatusQueued.CanTransitionTo(StatusRunning))
	require.True(t, StatusRunning.CanTransitionTo(StatusSuccess))
	require.True(t, StatusRunning.CanTransitionTo(StatusRuntimeError))
	require.False(t, StatusQueued.CanTransitionTo(StatusSuccess))
	require.False(t, StatusSuccess.CanTransitionTo(StatusRunning))
	require.False(t, RunStatus("unknown").CanTransitionTo(StatusSuccess))
}
