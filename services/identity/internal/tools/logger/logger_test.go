package logger

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNewRejectsInvalidLogLevel(t *testing.T) {
	t.Parallel()
	log, err := New("verbose")
	require.Error(t, err)
	require.Nil(t, log)
}
