package identityapi

import (
	"encoding/json"
	"net/http"
	"strings"

	deviceservice "github.com/dobriygolang/project-nordly/services/identity/internal/device/service"
	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

type registerDeviceRequest struct {
	DeviceID   string `json:"deviceId"`
	Name       string `json:"name"`
	AppVersion string `json:"appVersion"`
}

type registerDeviceResponse struct {
	DeviceID          string `json:"deviceId"`
	CloudSyncEnabled  bool   `json:"cloudSyncEnabled"`
	DeviceLimit       int    `json:"deviceLimit"`
	DevicesRegistered int    `json:"devicesRegistered"`
}

type errorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// RegisterDeviceHTTP registers a Nordly desktop device for cloud sync (JWT required).
func RegisterDeviceHTTP(validator *jwt.Validator, devices deviceservice.Service) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" {
			writeDeviceError(w, http.StatusUnauthorized, "unauthorized", "authorization required")
			return
		}
		userID, err := validator.UserID(token)
		if err != nil {
			writeDeviceError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
			return
		}

		var req registerDeviceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeDeviceError(w, http.StatusBadRequest, "invalid_argument", "invalid json body")
			return
		}
		deviceID := strings.TrimSpace(req.DeviceID)
		if deviceID == "" {
			deviceID = strings.TrimSpace(r.Header.Get("X-Device-ID"))
		}
		if deviceID == "" {
			writeDeviceError(w, http.StatusBadRequest, "invalid_argument", "deviceId required")
			return
		}

		result, err := devices.RegisterDevice(r.Context(), userID, deviceID, req.Name, req.AppVersion)
		if err != nil {
			mapDeviceError(w, err)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(registerDeviceResponse{
			DeviceID:          result.DeviceID,
			CloudSyncEnabled:  result.CloudSyncEnabled,
			DeviceLimit:       result.DeviceLimit,
			DevicesRegistered: result.DevicesRegistered,
		})
	}
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func mapDeviceError(w http.ResponseWriter, err error) {
	switch {
	case deviceservice.IsCloudSyncDisabled(err):
		writeDeviceError(w, http.StatusForbidden, "cloud_sync_disabled", "Cloud sync is disabled for this account")
	case deviceservice.IsDeviceLimitExceeded(err):
		writeDeviceError(w, http.StatusForbidden, "device_limit_exceeded", "Device limit reached")
	case deviceservice.IsInvalidArgument(err):
		writeDeviceError(w, http.StatusBadRequest, "invalid_argument", err.Error())
	default:
		writeDeviceError(w, http.StatusInternalServerError, "internal", "internal error")
	}
}

func writeDeviceError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(errorResponse{Code: code, Message: message})
}
