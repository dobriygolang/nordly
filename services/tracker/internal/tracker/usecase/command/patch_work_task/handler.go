package patch_work_task

import (
	"context"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// Store loads work tasks, epics, and applies patches.
type Store interface {
	GetEpic(ctx context.Context, epicID, userID string) (*model.Epic, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler patches work task details.
type Handler struct {
	store Store
}

// New constructs the patch-work-task handler.
func New(store Store) *Handler {
	if store == nil {
		panic("patch_work_task: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	patch := repository.WorkTaskPatch{
		ClearEpic:       cmd.ClearEpic,
		ClearConference: cmd.ClearConference,
	}
	if !cmd.ClearEpic && cmd.EpicID != nil {
		epicID := strings.TrimSpace(*cmd.EpicID)
		if _, err := h.store.GetEpic(ctx, epicID, cmd.UserID); err != nil {
			return nil, err
		}
		patch.EpicID = &epicID
	}
	if !cmd.ClearConference {
		if cmd.ConferenceURL != nil {
			url := strings.TrimSpace(*cmd.ConferenceURL)
			patch.ConferenceURL = &url
		}
		if cmd.ConferenceProvider != nil {
			p := strings.TrimSpace(strings.ToLower(*cmd.ConferenceProvider))
			patch.ConferenceProvider = &p
		}
		if cmd.GoogleEventID != nil {
			id := strings.TrimSpace(*cmd.GoogleEventID)
			patch.GoogleEventID = &id
		}
		if cmd.ZoomMeetingID != nil {
			id := strings.TrimSpace(*cmd.ZoomMeetingID)
			patch.ZoomMeetingID = &id
		}
	}
	return h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, patch)
}
