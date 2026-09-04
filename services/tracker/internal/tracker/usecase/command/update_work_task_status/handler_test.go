package update_work_task_status_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func TestHandlePatchesStatusOnly(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	want := &model.WorkTask{ID: testTaskID, Status: model.WorkStatusDone}
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.Status != nil && *p.Status == model.WorkStatusDone && p.Title == nil
		})).
		Return(want, nil)

	h, err := update_work_task_status.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), update_work_task_status.Command{
		UserID: testUserID,
		TaskID: testTaskID,
		Status: model.WorkStatusDone,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleRejectsInvalidStatusWithoutStore(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	h, err := update_work_task_status.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), update_work_task_status.Command{
		UserID: testUserID,
		TaskID: testTaskID,
		Status: model.WorkStatus("nope"),
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandlePropagatesPatchError(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.Anything).
		Return(nil, errors.New("db down"))

	h, err := update_work_task_status.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), update_work_task_status.Command{
		UserID: testUserID,
		TaskID: testTaskID,
		Status: model.WorkStatusTodo,
	})
	require.EqualError(t, err, "db down")
}
