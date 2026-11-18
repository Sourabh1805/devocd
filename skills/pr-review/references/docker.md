# Docker

Load when the diff changes `Dockerfile*`, `*.dockerfile`, `compose*.yaml`, `compose*.yml`, `docker-compose*.yaml`, `docker-compose*.yml` or `.dockerignore`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Lint: `hadolint Dockerfile`.
- Build: `docker build` runs the Dockerfile's own commands, so it is PR-controlled code; only when approved, and asked again after this change.
- Image scan: `trivy image`, when the repo uses it.

## Look for

- A base image with no tag or `latest`, or not pinned by digest where the repo pins others.
- No `USER`: the container runs as root.
- Secrets in `ENV`, `ARG` or a copied file: they stay in the image layers.
- `curl ... | sh` or `ADD` from a URL with no checksum.
- No `.dockerignore`, so `COPY . .` copies `.env`, `.git` or keys.
- Package installs without a pinned version, or without cleaning the cache in the same layer.
- Compose: `privileged: true`, `network_mode: host`, the Docker socket mounted, passwords in plain text, ports bound to all interfaces that should be local.
- A `HEALTHCHECK` or restart policy removed from a service that had one.
