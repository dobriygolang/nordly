package model

const (
	// MaxNoteTitleBytes bounds UTF-8 title storage and transport work.
	MaxNoteTitleBytes = 1 << 10
	// MaxNoteBodyBytes bounds plaintext, ciphertext, and the stored publish snapshot.
	MaxNoteBodyBytes = 32 << 20
	// MaxNoteAttachments bounds both stored and publish-time attachment batches.
	MaxNoteAttachments = 50
	// MaxAttachmentBytes bounds one decoded image attachment.
	MaxAttachmentBytes = 5 << 20
	// MaxPrivatePublishAssetBytes bounds images embedded into a password-protected snapshot.
	MaxPrivatePublishAssetBytes = 15 << 20
	MinPublishPasswordBytes     = 4
	MaxPublishPasswordBytes     = 72
)
