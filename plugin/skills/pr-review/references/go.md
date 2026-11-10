# Go

Load when the diff changes `*.go`, `go.mod` or `go.sum`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Tests: `go test ./...`.
- Vet: `go vet ./...`.
- Format: `gofmt -l .` (lists files that aren't formatted).
- Lint: `staticcheck ./...` or `golangci-lint run`, when the repo configures one.

A change to `go.mod`, `go.sum`, a `Makefile`, `.golangci.yml` or a `//go:generate` line means asking again before any approved command.

## Look for

- An `err` ignored (`_ =`, or no check), or shadowed by `:=` in an inner scope.
- A write to a nil map; a nil pointer used after an error was ignored.
- A goroutine with no way to stop (no context or done channel); a `WaitGroup` used wrongly.
- A map or slice shared between goroutines without a lock.
- `defer` inside a loop that holds resources until the function returns.
- `resp.Body` not closed; `http.Client` with no timeout.
- SQL built with `fmt.Sprintf`; use placeholders.
- Input in `filepath.Join` or `os.Open`: path traversal.
- Integer conversions that overflow (`int64` to `int32`).
- A `context.Context` not passed down, so cancellation doesn't reach the work.
