package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

const usernameMaxLen = 32

var (
	nonUsernameChars         = regexp.MustCompile(`[^a-z0-9_]+`)
	errUsernameBaseExhausted = errors.New("username base exhausted")
)

// UsernameExistsChecker looks up whether a username is already taken.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=UsernameExistsChecker --output=./mocks --outpkg=mocks --filename=username_exists_checker.go
type UsernameExistsChecker interface {
	UsernameExists(ctx context.Context, username string) (bool, error)
}

// AllocateUsername returns a unique normalized username.
func AllocateUsername(ctx context.Context, users UsernameExistsChecker, candidates ...string) (string, error) {
	for _, candidate := range candidates {
		base := normalizeUsername(candidate)
		if base == "" {
			continue
		}
		username, err := ensureUnique(ctx, users, base)
		if err != nil {
			if isUsernameBaseExhausted(err) {
				continue
			}
			return "", err
		}
		if username != "" {
			return username, nil
		}
	}

	for i := 0; i < 8; i++ {
		suffix, err := randomSuffix(6)
		if err != nil {
			return "", err
		}
		base := "user_" + suffix
		username, err := ensureUnique(ctx, users, base)
		if err != nil {
			if isUsernameBaseExhausted(err) {
				continue
			}
			return "", err
		}
		if username != "" {
			return username, nil
		}
	}

	return "", fmt.Errorf("allocate username: exhausted candidates")
}

func isUsernameBaseExhausted(err error) bool {
	return errors.Is(err, errUsernameBaseExhausted)
}

func ensureUnique(ctx context.Context, users UsernameExistsChecker, base string) (string, error) {
	if base == "" {
		return "", nil
	}

	exists, err := users.UsernameExists(ctx, base)
	if err != nil {
		return "", err
	}
	if !exists {
		return base, nil
	}

	for i := 0; i < 8; i++ {
		suffix, err := randomSuffix(4)
		if err != nil {
			return "", err
		}
		candidate := trimUsername(base + "_" + suffix)
		exists, err := users.UsernameExists(ctx, candidate)
		if err != nil {
			return "", err
		}
		if !exists {
			return candidate, nil
		}
	}

	return "", fmt.Errorf("%w: %s", errUsernameBaseExhausted, base)
}

func normalizeUsername(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	value = strings.TrimPrefix(value, "@")
	value = nonUsernameChars.ReplaceAllString(value, "_")
	value = strings.Trim(value, "_")
	return trimUsername(value)
}

func trimUsername(value string) string {
	if len(value) > usernameMaxLen {
		return strings.Trim(value[:usernameMaxLen], "_")
	}
	return value
}

func randomSuffix(length int) (string, error) {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
	result := make([]byte, length)
	for i := range result {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", fmt.Errorf("random suffix: %w", err)
		}
		result[i] = alphabet[n.Int64()]
	}
	return string(result), nil
}

func telegramUsernameCandidates(firstName, lastName, username string) []string {
	if username != "" {
		return []string{username}
	}
	if firstName != "" && lastName != "" {
		return []string{firstName + lastName, firstName + "_" + lastName, firstName}
	}
	if firstName != "" {
		return []string{firstName}
	}
	return nil
}

func pickAvatar(current, telegram string) string {
	if telegram != "" {
		return telegram
	}
	return current
}
