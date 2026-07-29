package support

// ValidWorkStatus reports whether s is an allowed kanban status.
func ValidWorkStatus(s string) bool {
	switch s {
	case "todo", "in_progress", "in_review", "done", "dismissed":
		return true
	default:
		return false
	}
}

// ValidWorkKind reports whether s is an allowed work task kind.
func ValidWorkKind(s string) bool {
	switch s {
	case "algo", "sysdesign", "quiz", "reflection", "reading", "ml", "custom":
		return true
	default:
		return false
	}
}
