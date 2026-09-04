package model

// PublishAccessMode is the access policy for a published note.
type PublishAccessMode string

const (
	PublishAccessModePublic   PublishAccessMode = "public"
	PublishAccessModePassword PublishAccessMode = "password"
)

// IsValid reports whether the access mode is a supported publish policy.
func (m PublishAccessMode) IsValid() bool {
	return m == PublishAccessModePublic || m == PublishAccessModePassword
}

// PublishExpiryPolicy is the closed set of supported publish lifetimes.
type PublishExpiryPolicy string

const (
	PublishExpiryPolicyNever      PublishExpiryPolicy = "never"
	PublishExpiryPolicySevenDays  PublishExpiryPolicy = "seven_days"
	PublishExpiryPolicyThirtyDays PublishExpiryPolicy = "thirty_days"
	PublishExpiryPolicyNinetyDays PublishExpiryPolicy = "ninety_days"
)

// Days returns the number of calendar days represented by the policy.
func (p PublishExpiryPolicy) Days() (int, bool) {
	switch p {
	case PublishExpiryPolicyNever:
		return 0, true
	case PublishExpiryPolicySevenDays:
		return 7, true
	case PublishExpiryPolicyThirtyDays:
		return 30, true
	case PublishExpiryPolicyNinetyDays:
		return 90, true
	default:
		return 0, false
	}
}
