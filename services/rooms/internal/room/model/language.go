package model

import "fmt"

type Language string

const (
	LanguageGo         Language = "go"
	LanguagePython     Language = "python"
	LanguageJavaScript Language = "javascript"
	LanguageTypeScript Language = "typescript"
	LanguageDiagram    Language = "diagram"
)

func (l Language) IsValid() bool {
	switch l {
	case LanguageGo, LanguagePython, LanguageJavaScript, LanguageTypeScript, LanguageDiagram:
		return true
	}
	return false
}

func (l Language) String() string { return string(l) }

func ParseLanguage(value string) (Language, error) {
	language := Language(value)
	if !language.IsValid() {
		return "", fmt.Errorf("%w: invalid language %q", ErrInvalidState, value)
	}
	return language, nil
}
