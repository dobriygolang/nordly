package get_code_run_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/query/get_code_run"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/query/get_code_run/mocks"
)

const roomID = "550e8400-e29b-41d4-a716-446655440000"
const (
	ownerID = "9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03"
	guestID = "3f019359-f660-4f51-a198-43c776fe4204"
	runID   = "44db49fd-8f41-465c-a581-8fc87d3c356b"
)

func TestHandleRejectsMissingSelectors(t *testing.T) {
	t.Parallel()
	h, err := get_code_run.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_code_run.Query{})
	require.ErrorIs(t, err, model.ErrInvalidInput)
}

func TestHandleRejectsNonCanonicalRunID(t *testing.T) {
	t.Parallel()
	h, err := get_code_run.New(mocks.NewStore(t))
	require.NoError(t, err)

	_, err = h.Handle(context.Background(), get_code_run.Query{UserID: ownerID, RunID: "not-a-uuid"})
	require.ErrorIs(t, err, model.ErrInvalidInput)
}

func TestHandleAllowsOwner(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetByID(mock.Anything, runID).Return(&model.CodeRun{
		ID: runID, UserID: ownerID, Status: model.StatusSuccess,
	}, nil)

	h, err := get_code_run.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), get_code_run.Query{UserID: ownerID, RunID: runID})
	require.NoError(t, err)
	require.Equal(t, runID, got.ID)
}

func TestHandleAllowsRoomGuest(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetByID(mock.Anything, runID).Return(&model.CodeRun{
		ID: runID, UserID: ownerID, RoomID: roomID, Status: model.StatusSuccess,
	}, nil)

	h, err := get_code_run.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), get_code_run.Query{
		UserID: guestID, EditorRoomID: roomID, RunID: runID,
	})
	require.NoError(t, err)
	require.Equal(t, runID, got.ID)
}

func TestHandleForbidsOtherRoom(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetByID(mock.Anything, runID).Return(&model.CodeRun{
		ID: runID, UserID: ownerID, RoomID: roomID,
	}, nil)

	h, err := get_code_run.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_code_run.Query{
		UserID: guestID, EditorRoomID: "0cdf6bd9-5203-4635-95e4-119db147a033", RunID: runID,
	})
	require.ErrorIs(t, err, model.ErrForbidden)
}

func TestHandleKeepsEditorTokenBoundWhenSubjectOwnsRun(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetByID(mock.Anything, runID).Return(&model.CodeRun{
		ID: runID, UserID: ownerID, RoomID: roomID,
	}, nil)
	h, err := get_code_run.New(store)
	require.NoError(t, err)

	_, err = h.Handle(context.Background(), get_code_run.Query{
		UserID:       ownerID,
		EditorRoomID: "0cdf6bd9-5203-4635-95e4-119db147a033",
		RunID:        runID,
	})
	require.ErrorIs(t, err, model.ErrForbidden)
}
