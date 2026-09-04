package unschedule_work_task_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func TestHandleRejectsMissingIDs(t *testing.T) {
	t.Parallel()
	h, err := unschedule_work_task.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), unschedule_work_task.Command{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleClearsSchedule(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	want := &model.WorkTask{ID: testTaskID}
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, model.WorkTaskPatch{ClearSchedule: true}).
		Return(want, nil)

	h, err := unschedule_work_task.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), unschedule_work_task.Command{UserID: testUserID, TaskID: testTaskID})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
