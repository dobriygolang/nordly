package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/dobriygolang/project-nordly/services/notes/cmd/notes/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	a, err := app.New(ctx)
	if err != nil {
		panic(err)
	}
	defer a.Close()

	if err := app.RunAPI(ctx, a); err != nil {
		panic(err)
	}
}
