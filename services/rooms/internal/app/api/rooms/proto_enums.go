package roomsapi

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func roomTypeToProto(t model.RoomType) (roomsv1.RoomType, error) {
	switch t {
	case model.RoomTypePractice:
		return roomsv1.RoomType_ROOM_TYPE_PRACTICE, nil
	case model.RoomTypeSystemDesign:
		return roomsv1.RoomType_ROOM_TYPE_SYSTEM_DESIGN, nil
	default:
		return roomsv1.RoomType_ROOM_TYPE_UNSPECIFIED, fmt.Errorf("unknown room type %q", t)
	}
}

func roomTypeFromProto(t roomsv1.RoomType) (model.RoomType, error) {
	switch t {
	case roomsv1.RoomType_ROOM_TYPE_PRACTICE:
		return model.RoomTypePractice, nil
	case roomsv1.RoomType_ROOM_TYPE_SYSTEM_DESIGN:
		return model.RoomTypeSystemDesign, nil
	default:
		return "", fmt.Errorf("room type is required")
	}
}

func roomLanguageToProto(l model.Language) (roomsv1.RoomLanguage, error) {
	switch l {
	case model.LanguageGo:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_GO, nil
	case model.LanguagePython:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_PYTHON, nil
	case model.LanguageJavaScript:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_JAVASCRIPT, nil
	case model.LanguageTypeScript:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_TYPESCRIPT, nil
	case model.LanguageDiagram:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_DIAGRAM, nil
	default:
		return roomsv1.RoomLanguage_ROOM_LANGUAGE_UNSPECIFIED, fmt.Errorf("unknown room language %q", l)
	}
}

func roomLanguageFromProto(l roomsv1.RoomLanguage) (model.Language, error) {
	switch l {
	case roomsv1.RoomLanguage_ROOM_LANGUAGE_GO:
		return model.LanguageGo, nil
	case roomsv1.RoomLanguage_ROOM_LANGUAGE_PYTHON:
		return model.LanguagePython, nil
	case roomsv1.RoomLanguage_ROOM_LANGUAGE_JAVASCRIPT:
		return model.LanguageJavaScript, nil
	case roomsv1.RoomLanguage_ROOM_LANGUAGE_TYPESCRIPT:
		return model.LanguageTypeScript, nil
	case roomsv1.RoomLanguage_ROOM_LANGUAGE_DIAGRAM:
		return model.LanguageDiagram, nil
	default:
		return "", fmt.Errorf("language is required")
	}
}
