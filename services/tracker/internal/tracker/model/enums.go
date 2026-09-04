package model

import "strings"

type WorkStatus string

const (
	WorkStatusTodo      WorkStatus = "todo"
	WorkStatusDone      WorkStatus = "done"
	WorkStatusDismissed WorkStatus = "dismissed"
)

func (s WorkStatus) IsValid() bool {
	switch s {
	case WorkStatusTodo, WorkStatusDone, WorkStatusDismissed:
		return true
	default:
		return false
	}
}

func (s WorkStatus) IsDone() bool { return s == WorkStatusDone }

func (s WorkStatus) String() string { return string(s) }

func ParseWorkStatus(s string) (WorkStatus, bool) {
	status := WorkStatus(strings.TrimSpace(s))
	return status, status.IsValid()
}

type WorkKind string

const WorkKindCustom WorkKind = "custom"

func (k WorkKind) IsValid() bool {
	return k == WorkKindCustom
}

func (k WorkKind) String() string { return string(k) }

func ParseWorkKind(s string) (WorkKind, bool) {
	kind := WorkKind(strings.TrimSpace(s))
	return kind, kind.IsValid()
}

type ConferenceProvider string

const (
	ConferenceProviderMeet ConferenceProvider = "meet"
	ConferenceProviderZoom ConferenceProvider = "zoom"
)

func (p ConferenceProvider) IsValid() bool {
	switch p {
	case ConferenceProviderMeet, ConferenceProviderZoom:
		return true
	default:
		return false
	}
}

func (p ConferenceProvider) String() string { return string(p) }

func ParseConferenceProvider(s string) (ConferenceProvider, bool) {
	provider := ConferenceProvider(strings.TrimSpace(strings.ToLower(s)))
	return provider, provider.IsValid()
}
