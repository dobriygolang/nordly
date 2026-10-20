package metrics

import (
	"errors"
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

func TestIncSyncUsesClosedLabels(t *testing.T) {
	before := testutil.ToFloat64(syncOpsTotal.WithLabelValues("push", "ok"))
	IncSync(OpPush)
	after := testutil.ToFloat64(syncOpsTotal.WithLabelValues("push", "ok"))
	if after != before+1 {
		t.Fatalf("push ok = %v, want %v", after, before+1)
	}

	secret := errors.New("projects/secret.md")
	beforeErr := testutil.ToFloat64(syncOpsTotal.WithLabelValues("pull", "internal"))
	IncSyncError(OpPull, secret)
	afterErr := testutil.ToFloat64(syncOpsTotal.WithLabelValues("pull", "internal"))
	if afterErr != beforeErr+1 {
		t.Fatalf("pull internal = %v, want %v", afterErr, beforeErr+1)
	}

	beforeCode := testutil.ToFloat64(syncOpsTotal.WithLabelValues("delete", "not_found"))
	IncSyncError(OpDelete, notesmodel.ErrNotFound)
	afterCode := testutil.ToFloat64(syncOpsTotal.WithLabelValues("delete", "not_found"))
	if afterCode != beforeCode+1 {
		t.Fatalf("delete not_found = %v, want %v", afterCode, beforeCode+1)
	}
}
