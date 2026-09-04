package sandboxapi

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
)

func languageToProto(l model.Language) (sandboxv1.Language, error) {
	switch l {
	case model.LangGo:
		return sandboxv1.Language_LANGUAGE_GO, nil
	case model.LangPython:
		return sandboxv1.Language_LANGUAGE_PYTHON, nil
	case model.LangJavaScript:
		return sandboxv1.Language_LANGUAGE_JAVASCRIPT, nil
	default:
		return sandboxv1.Language_LANGUAGE_UNSPECIFIED, fmt.Errorf("unknown language %q", l)
	}
}

func languageFromProto(l sandboxv1.Language) (model.Language, error) {
	switch l {
	case sandboxv1.Language_LANGUAGE_GO:
		return model.LangGo, nil
	case sandboxv1.Language_LANGUAGE_PYTHON:
		return model.LangPython, nil
	case sandboxv1.Language_LANGUAGE_JAVASCRIPT:
		return model.LangJavaScript, nil
	default:
		return "", fmt.Errorf("language is required")
	}
}

func runStatusToProto(s model.RunStatus) (sandboxv1.RunStatus, error) {
	switch s {
	case model.StatusQueued:
		return sandboxv1.RunStatus_RUN_STATUS_QUEUED, nil
	case model.StatusRunning:
		return sandboxv1.RunStatus_RUN_STATUS_RUNNING, nil
	case model.StatusSuccess:
		return sandboxv1.RunStatus_RUN_STATUS_SUCCESS, nil
	case model.StatusCompileError:
		return sandboxv1.RunStatus_RUN_STATUS_COMPILE_ERROR, nil
	case model.StatusRuntimeError:
		return sandboxv1.RunStatus_RUN_STATUS_RUNTIME_ERROR, nil
	case model.StatusTimeout:
		return sandboxv1.RunStatus_RUN_STATUS_TIMEOUT, nil
	case model.StatusInternalError:
		return sandboxv1.RunStatus_RUN_STATUS_INTERNAL_ERROR, nil
	default:
		return sandboxv1.RunStatus_RUN_STATUS_UNSPECIFIED, fmt.Errorf("unknown run status %q", s)
	}
}
