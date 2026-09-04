package main

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/dobriygolang/project-nordly/services/sandbox/cmd/sandbox/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	a, err := app.New(ctx)
	if err != nil {
		panic(err)
	}
	defer a.Close()

	var wg sync.WaitGroup
	errCh := make(chan error, 2)

	wg.Add(1)
	go func() {
		defer wg.Done()
		errCh <- app.RunWorker(ctx, a)
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		errCh <- app.RunAPI(ctx, a)
	}()

	var runErr error
	select {
	case <-ctx.Done():
	case err := <-errCh:
		runErr = err
	}

	stop()
	wg.Wait()
	close(errCh)
	for err := range errCh {
		if runErr == nil && err != nil {
			runErr = err
		}
	}
	if runErr != nil {
		panic(runErr)
	}
}
