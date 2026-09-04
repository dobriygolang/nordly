package update_work_task_status_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	repositorymocks "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository/mocks"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
)

func TestConcurrentStatusAndSchedulePatchesPreserveIndependentFields(t *testing.T) {
	t.Parallel()
	store := repositorymocks.NewStore(t)
	state := model.WorkTask{
		ID:     testTaskID,
		UserID: testUserID,
		Status: model.WorkStatusTodo,
		Kind:   model.WorkKindCustom,
		Title:  "Planning",
	}
	var stateMu sync.Mutex
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.Anything).
		RunAndReturn(func(_ context.Context, _, _ string, patch model.WorkTaskPatch) (*model.WorkTask, error) {
			stateMu.Lock()
			defer stateMu.Unlock()
			if patch.Status != nil {
				state.Status = *patch.Status
			}
			if patch.ScheduledStart != nil {
				state.ScheduledStart = patch.ScheduledStart
				state.ScheduledDurationMin = patch.ScheduledDurationMin
			}
			snapshot := state
			return &snapshot, nil
		}).
		Times(2)

	statusHandler, err := update_work_task_status.New(store)
	require.NoError(t, err)
	scheduleHandler, err := schedule_work_task.New(store)
	require.NoError(t, err)

	errs := make(chan error, 2)
	go func() {
		_, err := statusHandler.Handle(context.Background(), update_work_task_status.Command{
			UserID: testUserID,
			TaskID: testTaskID,
			Status: model.WorkStatusDone,
		})
		errs <- err
	}()
	go func() {
		_, err := scheduleHandler.Handle(context.Background(), schedule_work_task.Command{
			UserID:      testUserID,
			TaskID:      testTaskID,
			StartISO:    "2026-08-28T09:00:00Z",
			DurationMin: 30,
		})
		errs <- err
	}()
	require.NoError(t, <-errs)
	require.NoError(t, <-errs)

	stateMu.Lock()
	defer stateMu.Unlock()
	require.Equal(t, model.WorkStatusDone, state.Status)
	require.Equal(t, time.Date(2026, 8, 28, 9, 0, 0, 0, time.UTC), *state.ScheduledStart)
	require.Equal(t, 30, *state.ScheduledDurationMin)
}
