package runner

import (
	"os"
	"path/filepath"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

const goModContents = "module sandbox\n\ngo 1.24\n"

func isGoLanguage(language model.Language) bool {
	return language == model.LangGo
}

func prepareGoWorkspace(dir string) error {
	return PrepareGoWorkspace(dir)
}

// PrepareGoWorkspace writes sandbox go.mod for isolated Go workspaces (runs, LSP).
func PrepareGoWorkspace(dir string) error {
	return writeGoMod(dir)
}

func writeGoMod(dir string) error {
	return os.WriteFile(filepath.Join(dir, "go.mod"), []byte(goModContents), 0o600)
}
