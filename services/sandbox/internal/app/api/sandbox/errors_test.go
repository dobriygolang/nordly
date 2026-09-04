package sandboxapi

import (
	"fmt"
	"testing"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestMapServiceErrorMapsValidationAndCapacity(t *testing.T) {
	t.Parallel()
	require.Equal(t, codes.InvalidArgument, status.Code(mapServiceError(
		fmt.Errorf("bad UUID: %w", model.ErrInvalidInput),
	)))
	require.Equal(t, codes.ResourceExhausted, status.Code(mapServiceError(
		fmt.Errorf("active: %w", model.ErrConcurrencyExceeded),
	)))
	require.Equal(t, codes.ResourceExhausted, status.Code(mapServiceError(
		fmt.Errorf("rate: %w", model.ErrRateExceeded),
	)))
}
