package notesapi

import (
	"context"
	"encoding/base64"
	"net/http"
	"strconv"

	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetPublishedNoteAsset(
	ctx context.Context,
	req *notesv1.GetPublishedNoteAssetRequest,
) (*notesv1.GetPublishedNoteAssetResponse, error) {
	asset, err := i.service.GetPublishedNoteAsset(ctx, req.GetSlug(), req.GetAssetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetPublishedNoteAssetResponse{
		Mime:    asset.MIME,
		DataB64: base64.StdEncoding.EncodeToString(asset.Data),
	}, nil
}

// RegisterPublicAssetHandler serves published images as raw bytes rather than JSON base64.
func RegisterPublicAssetHandler(mux *http.ServeMux, impl *Implementation) {
	mux.HandleFunc("GET /v1/notes/public/{slug}/assets/{asset_id}", func(w http.ResponseWriter, r *http.Request) {
		asset, err := impl.service.GetPublishedNoteAsset(r.Context(), r.PathValue("slug"), r.PathValue("asset_id"))
		if err != nil {
			if notesservice.IsNotFound(err) || notesservice.IsInvalidArgument(err) {
				http.NotFound(w, r)
				return
			}
			http.Error(w, "internal error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", asset.MIME)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Content-Length", strconv.Itoa(len(asset.Data)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(asset.Data)
	})
}
