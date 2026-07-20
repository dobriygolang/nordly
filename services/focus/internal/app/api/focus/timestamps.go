package focusapi

import (
	"time"

	focusservice "github.com/dobriygolang/project-nordly/services/focus/internal/focus/service"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func requireTimestamp(value *timestamppb.Timestamp) (*time.Time, error) {
	if value == nil {
		return nil, focusservice.ErrInvalidArgument
	}
	if err := value.CheckValid(); err != nil {
		return nil, focusservice.ErrInvalidArgument
	}
	parsed := value.AsTime()
	return &parsed, nil
}
