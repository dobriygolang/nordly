package model

import usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"

// AuthResult is returned after successful authentication.
type AuthResult struct {
	AccessToken  string
	RefreshToken string
	User         *usermodel.User
}
