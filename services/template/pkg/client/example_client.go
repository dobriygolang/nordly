package client

import exampleservice "github.com/dobriygolang/project-nordly/services/template/internal/example/service"

// ExampleClient is the port for other services — rename per domain.
type ExampleClient = exampleservice.Service
