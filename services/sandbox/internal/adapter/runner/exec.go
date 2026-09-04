package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"syscall"
	"time"
)

const commandWaitDelay = 2 * time.Second

func commandContext(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.WaitDelay = commandWaitDelay
	cmd.Cancel = func() error {
		if cmd.Process == nil {
			return os.ErrProcessDone
		}
		err := syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) {
			return os.ErrProcessDone
		}
		return err
	}
	return cmd
}

func executionTimedOut(parent, execution context.Context) bool {
	return parent.Err() == nil && errors.Is(execution.Err(), context.DeadlineExceeded)
}
