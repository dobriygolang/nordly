package trackerapi

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func workStatusToProto(s model.WorkStatus) (trackerv1.WorkStatus, error) {
	switch s {
	case model.WorkStatusTodo:
		return trackerv1.WorkStatus_WORK_STATUS_TODO, nil
	case model.WorkStatusDone:
		return trackerv1.WorkStatus_WORK_STATUS_DONE, nil
	case model.WorkStatusDismissed:
		return trackerv1.WorkStatus_WORK_STATUS_DISMISSED, nil
	default:
		return trackerv1.WorkStatus_WORK_STATUS_UNSPECIFIED, fmt.Errorf("unknown work status %q", s)
	}
}

func workStatusFromProto(s trackerv1.WorkStatus) (model.WorkStatus, error) {
	switch s {
	case trackerv1.WorkStatus_WORK_STATUS_TODO:
		return model.WorkStatusTodo, nil
	case trackerv1.WorkStatus_WORK_STATUS_DONE:
		return model.WorkStatusDone, nil
	case trackerv1.WorkStatus_WORK_STATUS_DISMISSED:
		return model.WorkStatusDismissed, nil
	default:
		return "", fmt.Errorf("work status is required")
	}
}

func workKindToProto(k model.WorkKind) (trackerv1.WorkKind, error) {
	if k == model.WorkKindCustom {
		return trackerv1.WorkKind_WORK_KIND_CUSTOM, nil
	}
	return trackerv1.WorkKind_WORK_KIND_UNSPECIFIED, fmt.Errorf("unknown work kind %q", k)
}

func workKindFromProto(k trackerv1.WorkKind) (model.WorkKind, error) {
	if k == trackerv1.WorkKind_WORK_KIND_CUSTOM {
		return model.WorkKindCustom, nil
	}
	return "", fmt.Errorf("work kind is required")
}

func conferenceProviderToProto(p model.ConferenceProvider) (trackerv1.ConferenceProvider, error) {
	switch p {
	case model.ConferenceProviderMeet:
		return trackerv1.ConferenceProvider_CONFERENCE_PROVIDER_MEET, nil
	case model.ConferenceProviderZoom:
		return trackerv1.ConferenceProvider_CONFERENCE_PROVIDER_ZOOM, nil
	default:
		return trackerv1.ConferenceProvider_CONFERENCE_PROVIDER_UNSPECIFIED, fmt.Errorf("unknown conference provider %q", p)
	}
}

func conferenceProviderFromProto(p trackerv1.ConferenceProvider) (model.ConferenceProvider, error) {
	switch p {
	case trackerv1.ConferenceProvider_CONFERENCE_PROVIDER_MEET:
		return model.ConferenceProviderMeet, nil
	case trackerv1.ConferenceProvider_CONFERENCE_PROVIDER_ZOOM:
		return model.ConferenceProviderZoom, nil
	default:
		return "", fmt.Errorf("conference provider is required")
	}
}
