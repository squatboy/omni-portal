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

## VM Docker Compose Deploy

Omni is deployed on an external VM with Docker Compose, not inside the
Kubernetes cluster. If the cluster fails, collector must not
fail with it.

CI only verifies the app and publishes `ghcr.io/squatboy/omni:<full-commit-sha>`.
To deploy a new version, update `deploy/.env` on the VM:

```dotenv
OMNI_IMAGE_TAG=<full-commit-sha>
KUBERNETES_API_URL=<kubernetes-api-url>
KUBERNETES_BEARER_TOKEN=<omni-reader-token>
NODE_EXTRA_CA_CERTS=/run/secrets/kubernetes-ca.crt
GITLAB_TOKEN=<set-gitlab-token>
ARGOCD_TOKEN=<set-argocd-token>
```

Compose baseline:

```yaml
services:
  omni:
    image: ghcr.io/squatboy/omni:${OMNI_IMAGE_TAG}
    restart: unless-stopped
    cap_add:
      - NET_RAW
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      KUBERNETES_API_URL: ${KUBERNETES_API_URL}
      KUBERNETES_BEARER_TOKEN: ${KUBERNETES_BEARER_TOKEN}
      NODE_EXTRA_CA_CERTS: ${NODE_EXTRA_CA_CERTS}
      GITLAB_TOKEN: ${GITLAB_TOKEN}
      ARGOCD_TOKEN: ${ARGOCD_TOKEN}
    volumes:
      - ./config/inventory.json:/app/config/inventory.json:ro
      - ./certs/kubernetes-ca.crt:/run/secrets/kubernetes-ca.crt:ro
```

Apply on the VM:

```bash
cd deploy
mkdir -p config certs
docker compose pull
docker compose up -d
docker compose ps
curl -fsS http://<VM-IP>:3000/api/health/ready
curl -fsS http://<VM-IP>:3000/api/collect/snapshot
```

After the container is running, open `http://<VM-IP>:3000` from the internal
network. Make sure the VM firewall allows inbound TCP `3000`.

## Kubernetes Read-Only Credential

Do not deploy the Omni app to Kubernetes. Kubernetes only needs read-only
credentials for the external collector.

Create `namespace omni`, `ServiceAccount omni-reader`,
`ClusterRole/ClusterRoleBinding`, and a service-account-token Secret named
`omni-reader-token`:

```bash
kubectl create namespace omni --dry-run=client -o yaml | kubectl apply -f -
kubectl -n omni create serviceaccount omni-reader --dry-run=client -o yaml | kubectl apply -f -
```

Create the Secret with this shape:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: omni-reader-token
  namespace: omni
  annotations:
    kubernetes.io/service-account.name: omni-reader
type: kubernetes.io/service-account-token
```

The VM collector connects to the Kubernetes API with HTTPS, the bearer token,
and a trusted cluster CA. Plain HTTP is not supported.

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
