package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Logger is a thin wrapper over structured logging.
type Logger interface {
	Debug(msg string, keysAndValues ...any)
	Info(msg string, keysAndValues ...any)
	Warn(msg string, keysAndValues ...any)
	Error(msg string, keysAndValues ...any)
	Sync() error
}

type zapLogger struct {
	sugar *zap.SugaredLogger
}

// New creates a logger with the given level (debug, info, warn, error).
func New(level string) (Logger, error) {
	cfg := zap.NewProductionConfig()
	cfg.Encoding = "json"

	lvl, err := zapcore.ParseLevel(level)
	if err != nil {
		lvl = zapcore.InfoLevel
	}
	cfg.Level = zap.NewAtomicLevelAt(lvl)

	z, err := cfg.Build()
	if err != nil {
		return nil, err
	}
	return &zapLogger{sugar: z.Sugar()}, nil
}

func (l *zapLogger) Debug(msg string, keysAndValues ...any) {
	l.sugar.Debugw(msg, keysAndValues...)
}

func (l *zapLogger) Info(msg string, keysAndValues ...any) {
	l.sugar.Infow(msg, keysAndValues...)
}

func (l *zapLogger) Warn(msg string, keysAndValues ...any) {
	l.sugar.Warnw(msg, keysAndValues...)
}

func (l *zapLogger) Error(msg string, keysAndValues ...any) {
	l.sugar.Errorw(msg, keysAndValues...)
}

func (l *zapLogger) Sync() error {
	return l.sugar.Sync()
}

type nopLogger struct{}

// Nop returns a no-op logger for tests.
func Nop() Logger { return nopLogger{} }

func (nopLogger) Debug(string, ...any) {}
func (nopLogger) Info(string, ...any)  {}
func (nopLogger) Warn(string, ...any)  {}
func (nopLogger) Error(string, ...any) {}
func (nopLogger) Sync() error          { return nil }
