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
The ingress manifest defines HTTP host routing for host only.
Add a TLS Secret and Ingress `tls` block separately if HTTPS is required.

Before Argo sync, create runtime-only config and secrets:

```bash
kubectl apply -f k8s/app/namespace.yaml
kubectl -n omni create configmap omni-inventory \
  --from-file=inventory.json=config/inventory.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n omni create secret generic omni-secrets \
  --from-literal=GITLAB_TOKEN='<set-gitlab-token>' \
  --from-literal=ARGOCD_TOKEN='<set-argocd-token>' \
  --dry-run=client -o yaml | kubectl apply -f -
```

First-time Argo CD bootstrap:

```bash
kubectl apply -n argocd -f k8s/argocd/application.yaml
```

On `main` pushes, GitHub Actions builds and pushes
`ghcr.io/squatboy/omni:<full-commit-sha>`, then commits the matching image tag
to `k8s/app/deployment.yaml` with `[skip ci]`.

RBAC checks:

```bash
kubectl auth can-i list nodes --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list pods --all-namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list services --all-namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list persistentvolumeclaims --all-namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list deployments.apps --all-namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list ingresses.networking.k8s.io --all-namespaces --as=system:serviceaccount:omni:omni-reader
kubectl auth can-i list nodes.metrics.k8s.io --as=system:serviceaccount:omni:omni-reader
```

Smoke checks:

```bash
kubectl -n omni get deploy,pod,svc,ingress
kubectl -n omni logs deploy/omni
curl -fsS http://omni.internal/api/health/ready
curl -fsS http://omni.internal/api/collect/snapshot
```
