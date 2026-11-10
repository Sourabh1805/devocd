# Kubernetes

Load when the diff changes YAML with `apiVersion:` and `kind:`, a Helm chart (`Chart.yaml`, `values*.yaml`, `templates/`) or `kustomization.yaml`.

## Never

Never run `kubectl apply`, `kubectl delete`, `kubectl create`, `helm install`, `helm upgrade` or `helm uninstall`: each one deploys or changes a cluster. Report them `blocked`.

## Usual checks

Each is `blocked` unless an approved command covers it; name the command the repo would use.
- Schema: `kubeconform` (reads files only).
- Lint: `helm lint`, `kube-linter lint` or `kubesec scan`.
- Rendering: `helm template` or `kustomize build` (reads files only; still needs approval).

## Look for

- No resource requests or limits.
- `privileged: true`, `allowPrivilegeEscalation: true`, no `runAsNonRoot`, `hostNetwork`, `hostPID` or `hostPath` mounts.
- An image with no tag or `latest`.
- A `kind: Secret` with real values in the repo, or secrets in plain `env` values.
- No readiness or liveness probe on a service that takes traffic.
- RBAC with `*` verbs or resources, or a new `cluster-admin` binding.
- A `Service` of type `LoadBalancer` or `NodePort`, or an `Ingress`, exposing something that was internal.
- A selector that no longer matches the pod labels; `replicas: 1` for something that must stay up.
