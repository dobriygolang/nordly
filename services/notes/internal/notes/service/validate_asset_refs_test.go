package service

import (
	"testing"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

func TestValidateAssetRefs_acceptsMatchedUUIDs(t *testing.T) {
	id := "11111111-1111-1111-1111-111111111111"
	err := validateAssetRefs(
		"hello ![pic](nordly-asset:"+id+") world",
		[]notesmodel.PublishedAttachment{{ID: id}},
	)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
}

func TestValidateAssetRefs_rejectsMissingAttachment(t *testing.T) {
	err := validateAssetRefs(
		"![pic](nordly-asset:11111111-1111-1111-1111-111111111111)",
		nil,
	)
	if err == nil {
		t.Fatal("expected ErrInvalidArgument")
	}
}

func TestValidateAssetRefs_rejectsMalformedScheme(t *testing.T) {
	err := validateAssetRefs("![pic](nordly-asset:not-a-uuid)", nil)
	if err == nil {
		t.Fatal("expected ErrInvalidArgument for malformed ref")
	}
}
