package get_item_test

import (
	"context"
	"testing"

	examplemodel "github.com/dobriygolang/project-nordly/services/template/internal/example/model"
	"github.com/dobriygolang/project-nordly/services/template/internal/example/usecase/query/get_item"
	"github.com/dobriygolang/project-nordly/services/template/internal/example/usecase/query/get_item/mocks"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestQueryValidate(t *testing.T) {
	t.Parallel()
	require.ErrorIs(t, get_item.Query{}.Validate(), examplemodel.ErrInvalidArgument)
	require.NoError(t, get_item.Query{ID: "1"}.Validate())
	require.NoError(t, get_item.Query{Slug: "x"}.Validate())
}

func TestHandleByID(t *testing.T) {
	t.Parallel()
	reader := mocks.NewItemReader(t)
	reader.EXPECT().GetItemByID(mock.Anything, "1").Return(&examplemodel.Item{ID: "1"}, nil)

	h, err := get_item.New(reader)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), get_item.Query{ID: "1"})
	require.NoError(t, err)
	require.Equal(t, "1", got.ID)
}

func TestHandleInvalid(t *testing.T) {
	t.Parallel()
	reader := mocks.NewItemReader(t)
	h, err := get_item.New(reader)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_item.Query{})
	require.ErrorIs(t, err, examplemodel.ErrInvalidArgument)
}
