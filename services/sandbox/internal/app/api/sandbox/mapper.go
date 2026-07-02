package sandboxapi

import (
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoCodeRun(run *model.CodeRun) *sandboxv1.CodeRun {
	out := &sandboxv1.CodeRun{
		Id:           run.ID,
		UserId:       run.UserID,
		Language:     run.Language,
		Status:       run.Status,
		RunType:      run.RunType,
		TestsTotal:   int32(run.TestsTotal),
		TestsPassed:  int32(run.TestsPassed),
		CreatedAt:    timestamppb.New(run.CreatedAt),
		UpdatedAt:   timestamppb.New(run.UpdatedAt),
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
		v := int32(*run.ExitCode)
		out.ExitCode = &v
	}
	if run.TimeMS != nil {
		v := int32(*run.TimeMS)
		out.TimeMs = &v
	}
	if run.MemoryKB != nil {
		v := int32(*run.MemoryKB)
		out.MemoryKb = &v
	}
	if run.Runner != nil {
		out.Runner = run.Runner
	}
	return out
}
