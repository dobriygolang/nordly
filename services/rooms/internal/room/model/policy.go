package model

import "fmt"

func ValidateCreate(roomType RoomType, lang Language) error {
	if !roomType.IsValid() {
		return fmt.Errorf("invalid room type %q", roomType)
	}
	if !lang.IsValid() {
		return fmt.Errorf("invalid language %q", lang)
	}
	return nil
}
