package support

import (
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// NormalizeWikiLinks trims and dedupes wiki-link refs by lowercase text.
func NormalizeWikiLinks(links []notesmodel.WikiLinkRef) ([]notesmodel.WikiLinkRef, error) {
	if len(links) == 0 {
		return nil, nil
	}
	seen := make(map[string]struct{}, len(links))
	out := make([]notesmodel.WikiLinkRef, 0, len(links))
	for _, l := range links {
		text := strings.TrimSpace(l.LinkText)
		if text == "" {
			return nil, notesmodel.ErrInvalidArgument
		}
		key := strings.ToLower(text)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		target := strings.TrimSpace(l.TargetNoteID)
		if target != "" && !IsUUID(target) {
			return nil, notesmodel.ErrInvalidArgument
		}
		out = append(out, notesmodel.WikiLinkRef{
			TargetNoteID: target,
			LinkText:     text,
		})
	}
	return out, nil
}
