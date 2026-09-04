package sandboxapi

import (
	"fmt"
	"math"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoCodeRun(run *model.CodeRun) (*sandboxv1.CodeRun, error) {
	if run == nil {
		return nil, fmt.Errorf("map code run: run is required")
	}
	language, err := languageToProto(run.Language)
	if err != nil {
		return nil, err
	}
	status, err := runStatusToProto(run.Status)
	if err != nil {
		return nil, err
	}
	createdAt := timestamppb.New(run.CreatedAt)
	if err := createdAt.CheckValid(); err != nil {
		return nil, fmt.Errorf("map code run created_at: %w", err)
	}
	updatedAt := timestamppb.New(run.UpdatedAt)
	if err := updatedAt.CheckValid(); err != nil {
		return nil, fmt.Errorf("map code run updated_at: %w", err)
	}
	out := &sandboxv1.CodeRun{
		Id:        run.ID,
		UserId:    run.UserID,
		Language:  language,
		Status:    status,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}
	if run.Stdout != nil {
		out.Stdout = run.Stdout
	}
	if run.Stderr != nil {
		out.Stderr = run.Stderr
	}
	if run.CompileOutput != nil {
		out.CompileOutput = run.CompileOutput
	}
	if run.Error != nil {
		out.Error = run.Error
	}
	if run.ExitCode != nil {
		v, err := int32Value("exit_code", *run.ExitCode)
		if err != nil {
			return nil, err
		}
		out.ExitCode = &v
	}
	if run.TimeMS != nil {
		v, err := int32Value("time_ms", *run.TimeMS)
		if err != nil {
			return nil, err
		}
		out.TimeMs = &v
	}
	if run.Runner != nil {
		out.Runner = run.Runner
	}
	return out, nil
}

func int32Value(field string, value int) (int32, error) {
	if value < math.MinInt32 || value > math.MaxInt32 {
		return 0, fmt.Errorf("map code run %s: value %d is out of int32 range", field, value)
	}
	return int32(value), nil
}
