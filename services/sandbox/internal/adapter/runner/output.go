package runner

import (
	"bytes"
	"fmt"
)

const truncationMarker = "\n...[truncated]"

// cappedWriter keeps a bounded prefix while reporting every byte consumed so
// os/exec continues draining the child pipe after the output limit is reached.
type cappedWriter struct {
	buf       bytes.Buffer
	limit     int
	truncated bool
}

func newCappedWriter(limit int) (*cappedWriter, error) {
	if limit <= 0 {
		return nil, fmt.Errorf("output limit must be > 0")
	}
	writer := &cappedWriter{limit: limit}
	writer.buf.Grow(limit)
	return writer, nil
}

func (w *cappedWriter) Write(p []byte) (int, error) {
	consumed := len(p)
	remaining := w.limit - w.buf.Len()
	if remaining <= 0 {
		w.truncated = w.truncated || consumed > 0
		return consumed, nil
	}
	if len(p) > remaining {
		_, _ = w.buf.Write(p[:remaining])
		w.truncated = true
		return consumed, nil
	}
	_, _ = w.buf.Write(p)
	return consumed, nil
}

func (w *cappedWriter) String() string {
	value := w.buf.String()
	if !w.truncated {
		return value
	}
	if w.limit <= len(truncationMarker) {
		return value[:w.limit]
	}
	return value[:w.limit-len(truncationMarker)] + truncationMarker
}

func (w *cappedWriter) Truncated() bool {
	return w.truncated
}

// LimitText applies the same persisted-output bound to adapter errors/results.
func LimitText(value string, limit int) (string, error) {
	writer, err := newCappedWriter(limit)
	if err != nil {
		return "", err
	}
	_, _ = writer.Write([]byte(value))
	return writer.String(), nil
}

func combineOutput(limit int, values ...string) (string, error) {
	writer, err := newCappedWriter(limit)
	if err != nil {
		return "", err
	}
	for _, value := range values {
		if value == "" {
			continue
		}
		if writer.buf.Len() > 0 {
			_, _ = writer.Write([]byte{'\n'})
		}
		_, _ = writer.Write([]byte(value))
	}
	return writer.String(), nil
}
