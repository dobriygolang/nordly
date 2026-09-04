package service

import "context"

func (s *service) ValidateToken(ctx context.Context, accessToken string) (string, error) {
	if accessToken == "" {
		return "", ErrUnauthorized
	}
	userID, err := s.tokens.ValidateAccessToken(accessToken)
	if err != nil {
		return "", ErrUnauthorized
	}
	if _, err := s.users.GetByID(ctx, userID); err != nil {
		if isUserNotFound(err) {
			return "", ErrUnauthorized
		}
		return "", err
	}
	return userID, nil
}
