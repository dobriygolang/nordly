package schedule_work_task_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func TestHandleRejectsBadDuration(t *testing.T) {
	t.Parallel()
	h, err := schedule_work_task.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), schedule_work_task.Command{
		UserID: testUserID, TaskID: testTaskID, StartISO: "2026-08-27T12:00:00Z", DurationMin: 10,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandlePatchesSchedule(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	start := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	want := &model.WorkTask{ID: testTaskID, Title: "Standup"}
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ScheduledStart != nil && p.ScheduledStart.Equal(start) &&
				p.ScheduledDurationMin != nil && *p.ScheduledDurationMin == 30
		})).
		Return(want, nil)

	h, err := schedule_work_task.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), schedule_work_task.Command{
		UserID: testUserID, TaskID: testTaskID, StartISO: "2026-08-27T12:00:00Z", DurationMin: 30,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
