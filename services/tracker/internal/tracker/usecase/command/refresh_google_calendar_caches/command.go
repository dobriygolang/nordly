package refresh_google_calendar_caches

// Command incrementally refreshes every connected Google account.
type Command struct{}

// Validate is a no-op: the command has no caller-supplied fields.
func (Command) Validate() error {
	return nil
}
