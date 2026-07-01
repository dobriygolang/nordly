// Package secretbox provides optional symmetric encryption for secrets at rest
// (Google refresh tokens). When no key is configured it is a transparent no-op,
// and it always round-trips legacy plaintext values so encryption can be enabled
// without a data migration.
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
)

// prefix marks a value produced by Seal so Open can distinguish it from legacy
// plaintext tokens stored before encryption was enabled.
const prefix = "enc:v1:"

// Cipher seals and opens secrets. A nil Cipher is a valid no-op (passthrough).
type Cipher struct {
	aead cipher.AEAD
}

// New builds a Cipher from a base64-encoded 16/24/32-byte AES key. An empty key
// returns (nil, nil): encryption is disabled and values are stored as plaintext.
func New(keyB64 string) (*Cipher, error) {
	keyB64 = strings.TrimSpace(keyB64)
	if keyB64 == "" {
		return nil, nil
	}
	key, err := base64.StdEncoding.DecodeString(keyB64)
	if err != nil {
		return nil, fmt.Errorf("decode encryption key: %w", err)
	}
	switch len(key) {
	case 16, 24, 32:
	default:
		return nil, fmt.Errorf("encryption key must be 16, 24 or 32 bytes, got %d", len(key))
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("new cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("new gcm: %w", err)
	}
	return &Cipher{aead: aead}, nil
}

// Seal encrypts plaintext. A nil Cipher returns the input unchanged.
func (c *Cipher) Seal(plaintext string) (string, error) {
	if c == nil || plaintext == "" {
		return plaintext, nil
	}
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("read nonce: %w", err)
	}
	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return prefix + base64.StdEncoding.EncodeToString(sealed), nil
}

// Open decrypts a value produced by Seal. Values without the prefix (legacy
// plaintext) are returned unchanged.
func (c *Cipher) Open(value string) (string, error) {
	if !strings.HasPrefix(value, prefix) {
		return value, nil
	}
	if c == nil {
		return "", errors.New("secretbox: encrypted value but no key configured")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(value, prefix))
	if err != nil {
		return "", fmt.Errorf("decode sealed value: %w", err)
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", errors.New("secretbox: sealed value too short")
	}
	nonce, ciphertext := raw[:ns], raw[ns:]
	plaintext, err := c.aead.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("open sealed value: %w", err)
	}
	return string(plaintext), nil
}
