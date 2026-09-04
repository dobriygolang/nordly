package share_note_to_web_test

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/command/share_note_to_web"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/command/share_note_to_web/mocks"
)

func TestNewRequiresDependencies(t *testing.T) {
	t.Parallel()

	_, err := share_note_to_web.New(share_note_to_web.Config{PublicBaseURL: "https://notes.example"})
	require.Error(t, err)

	store := mocks.NewStore(t)
	_, err = share_note_to_web.New(share_note_to_web.Config{Store: store})
	require.Error(t, err)
}

func TestCommandValidatePublishPolicy(t *testing.T) {
	t.Parallel()

	validPublic := notesmodel.PublishOptions{
		AccessMode:   notesmodel.PublishAccessModePublic,
		ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
	}
	validPassword := notesmodel.PublishOptions{
		AccessMode:   notesmodel.PublishAccessModePassword,
		ExpiryPolicy: notesmodel.PublishExpiryPolicySevenDays,
		Password:     "four",
	}
	tests := []struct {
		name    string
		command share_note_to_web.Command
		wantErr bool
	}{
		{name: "public", command: share_note_to_web.Command{UserID: "user", NoteID: "note", Options: validPublic}},
		{name: "password", command: share_note_to_web.Command{UserID: "user", NoteID: "note", Options: validPassword}},
		{
			name: "existing password may be retained",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note",
				Options: notesmodel.PublishOptions{
					AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
				},
			},
		},
		{name: "missing user", command: share_note_to_web.Command{NoteID: "note", Options: validPublic}, wantErr: true},
		{name: "missing note", command: share_note_to_web.Command{UserID: "user", Options: validPublic}, wantErr: true},
		{
			name: "unspecified access",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note", Options: notesmodel.PublishOptions{ExpiryPolicy: notesmodel.PublishExpiryPolicyNever},
			},
			wantErr: true,
		},
		{
			name: "unspecified expiry",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note", Options: notesmodel.PublishOptions{AccessMode: notesmodel.PublishAccessModePublic},
			},
			wantErr: true,
		},
		{
			name: "public password",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note",
				Options: notesmodel.PublishOptions{
					AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever, Password: "four",
				},
			},
			wantErr: true,
		},
		{
			name: "public expiry",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note",
				Options: notesmodel.PublishOptions{
					AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicySevenDays,
				},
			},
			wantErr: true,
		},
		{
			name: "password too short",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note",
				Options: notesmodel.PublishOptions{
					AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever, Password: "123",
				},
			},
			wantErr: true,
		},
		{
			name: "password too long",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note",
				Options: notesmodel.PublishOptions{
					AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
					Password: strings.Repeat("a", notesmodel.MaxPublishPasswordBytes+1),
				},
			},
			wantErr: true,
		},
		{
			name: "plaintext too large",
			command: share_note_to_web.Command{
				UserID: "user", NoteID: "note", Plaintext: strings.Repeat("a", notesmodel.MaxNoteBodyBytes+1), Options: validPublic,
			},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := tt.command.Validate()
			if tt.wantErr {
				require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestHandlePassesPublicPublishToLockedStore(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	h, err := share_note_to_web.New(share_note_to_web.Config{
		Store: store, PublicBaseURL: "https://notes.example",
	})
	require.NoError(t, err)

	assetID := "11111111-1111-1111-1111-111111111111"
	image := []byte("\x89PNG\r\n\x1a\n")
	plaintext := "![image](nordly-asset:" + assetID + ")"
	want := &notesmodel.ShareToWebResult{Slug: "public-slug"}
	store.EXPECT().
		ShareNoteToWeb(
			mock.Anything,
			"user",
			"note-1",
			plaintext,
			"https://notes.example",
			notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
			},
			mock.MatchedBy(func(assets []notesmodel.PublishedAttachment) bool {
				return len(assets) == 1 && assets[0].ID == assetID && string(assets[0].Data) == string(image)
			}),
		).
		Return(want, nil)

	got, err := h.Handle(context.Background(), share_note_to_web.Command{
		UserID:    "user",
		NoteID:    "note-1",
		Plaintext: plaintext,
		Options: notesmodel.PublishOptions{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		Attachments: []notesmodel.AttachmentInput{{
			ID: assetID, FileName: "image.png", MIME: "image/png", DataB64: base64.StdEncoding.EncodeToString(image),
		}},
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleHashesPasswordAndEmbedsPrivateAssets(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	h, err := share_note_to_web.New(share_note_to_web.Config{
		Store: store, PublicBaseURL: "https://notes.example",
	})
	require.NoError(t, err)

	assetID := "11111111-1111-1111-1111-111111111111"
	image := []byte("\x89PNG\r\n\x1a\n")
	embedded := "![image](data:image/png;base64," + base64.StdEncoding.EncodeToString(image) + ")"
	want := &notesmodel.ShareToWebResult{Slug: "private-slug"}
	store.EXPECT().
		ShareNoteToWeb(
			mock.Anything,
			"user",
			"note-1",
			embedded,
			"https://notes.example",
			mock.MatchedBy(func(meta notesmodel.PublishMeta) bool {
				return meta.AccessMode == notesmodel.PublishAccessModePassword &&
					meta.ExpiryPolicy == notesmodel.PublishExpiryPolicyThirtyDays &&
					meta.NewPasswordHash != nil &&
					bcrypt.CompareHashAndPassword([]byte(*meta.NewPasswordHash), []byte("hunter2")) == nil
			}),
			[]notesmodel.PublishedAttachment(nil),
		).
		Return(want, nil)

	got, err := h.Handle(context.Background(), share_note_to_web.Command{
		UserID: "user", NoteID: "note-1", Plaintext: "![image](nordly-asset:" + assetID + ")",
		Options: notesmodel.PublishOptions{
			AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyThirtyDays,
			Password: "hunter2",
		},
		Attachments: []notesmodel.AttachmentInput{{
			ID: assetID, FileName: "image.png", MIME: "image/png", DataB64: base64.StdEncoding.EncodeToString(image),
		}},
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
