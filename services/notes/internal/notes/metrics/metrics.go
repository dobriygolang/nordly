package metrics

import (
	"errors"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// Op is a Prometheus label for a notes sync write or read.
// Conflict copies are created on the device and later arrive as a push.
type Op string

const (
	OpPush   Op = "push"
	OpPull   Op = "pull"
	OpDelete Op = "delete"
)

func (o Op) String() string { return string(o) }

var syncOpsTotal = promauto.NewCounterVec(prometheus.CounterOpts{
	Name: "notes_sync_ops_total",
	Help: "Notes sync operations. result is ok or a closed error code. Labels never include note content.",
}, []string{"op", "result"})

// IncSync counts one successful sync operation.
func IncSync(op Op) {
	syncOpsTotal.WithLabelValues(op.String(), "ok").Inc()
}

// IncSyncError counts one failed sync operation. The label is a closed code, not the error text.
func IncSyncError(op Op, err error) {
	syncOpsTotal.WithLabelValues(op.String(), errorCode(err)).Inc()
}

func errorCode(err error) string {
	switch {
	case errors.Is(err, notesmodel.ErrNotFound):
		return "not_found"
	case errors.Is(err, notesmodel.ErrInvalidArgument):
		return "invalid_argument"
	case errors.Is(err, notesmodel.ErrAccessDenied):
		return "access_denied"
	case errors.Is(err, notesmodel.ErrTooManyNotes):
		return "too_many"
	default:
		return "internal"
	}
}
