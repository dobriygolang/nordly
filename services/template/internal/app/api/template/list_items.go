package templateapi

import (
	"context"

	templatev1 "github.com/dobriygolang/project-nordly/services/template/pkg/api/template/v1"
)

// ListItems returns paginated items.
func (i *Implementation) ListItems(ctx context.Context, req *templatev1.ListItemsRequest) (*templatev1.ListItemsResponse, error) {
	items, err := i.service.ListItems(ctx, int(req.GetLimit()), int(req.GetOffset()))
	if err != nil {
		return nil, mapServiceError(err)
	}

	protoItems := make([]*templatev1.Item, 0, len(items))
	for idx := range items {
		protoItem, err := toProtoItem(&items[idx])
		if err != nil {
			return nil, err
		}
		protoItems = append(protoItems, protoItem)
	}
	return &templatev1.ListItemsResponse{Items: protoItems}, nil
}
