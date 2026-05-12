# Omni

Internal infrastructure dashboard built as a single Next.js app.

## Local checks

```bash
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

## Image

GitHub Actions publishes only immutable full-SHA images on pushes to `main`.
No `latest` tag is produced.
If the package is created as private, change GHCR package visibility to public
before deploying without image pull credentials.

Image format:

```text
ghcr.io/squatboy/omni:<full-commit-sha>
```

Local build check:

```bash
docker build --platform linux/amd64 -t omni:test .
```

## GitOps Deploy

Runtime manifests live in `k8s/app/`. The Argo CD bootstrap manifest lives in
`k8s/argocd/application.yaml`.
The ingress manifest defines host routing only. HTTPS smoke checks assume TLS
termination for `omni.example.internal` is already handled by the cluster/front
proxy path.

First-time bootstrap:

```bash
kubectl apply -n argocd -f k8s/argocd/application.yaml
```

Before Argo sync, create runtime-only config and secrets:

```bash
kubectl create namespace omni --dry-run=client -o yaml | kubectl apply -f -
kubectl -n omni create configmap omni-inventory \
  --from-file=inventory.json=config/inventory.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n omni create secret generic omni-secrets \
  --from-literal=GITLAB_TOKEN='<set-gitlab-token>' \
  --from-literal=ARGOCD_TOKEN='<set-argocd-token>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Release a built image by replacing the image in
`k8s/app/deployment.yaml` with the full commit SHA tag, then commit and push.

Smoke checks:

```bash
kubectl -n omni get pods,svc,ingress
curl -fsS https://omni.example.internal/
curl -fsS https://omni.example.internal/api/collect/snapshot
```
