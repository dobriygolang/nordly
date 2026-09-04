package model_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

func TestValidateUUIDRequiresCanonicalForm(t *testing.T) {
	t.Parallel()
	require.NoError(t, model.ValidateUUID("task_id", "22222222-2222-4222-8222-222222222222"))

	for _, value := range []string{
		"",
		"not-a-uuid",
		"22222222222242228222222222222222",
		"{22222222-2222-4222-8222-222222222222}",
		" 22222222-2222-4222-8222-222222222222 ",
	} {
		err := model.ValidateUUID("task_id", value)
		require.ErrorIs(t, err, model.ErrInvalidArgument)
	}
}
