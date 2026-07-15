package repository

import "testing"

func TestPublishQuotaExceeded(t *testing.T) {
	limit := 2
	if publishQuotaExceeded(1, &limit) {
		t.Fatal("quota should allow a publish below the limit")
	}
	if !publishQuotaExceeded(2, &limit) {
		t.Fatal("quota should reject a publish at the limit")
	}
	if publishQuotaExceeded(100, nil) {
		t.Fatal("unlimited quota should allow publishes")
	}
}
