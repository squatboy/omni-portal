# Omni Dashboard

Omni is an internal infrastructure dashboard that centralizes the status of virtual machines, Kubernetes clusters, and development tools (GitLab, ArgoCD, Nexus) into a single, unified view.

## Features
- **Centralized Dashboard**: View the health and metrics of all your infrastructure components in one place.
- **Agentless Collection**: The Go backend securely collects data via APIs and SSH without requiring any agents installed on your target systems.
- **Resilient Architecture**: Designed to run externally from your clusters so it remains accessible even during major outages.

## Self-Hosted Deployment Guide

Omni is deployed on an external VM using Docker Compose and prebuilt GHCR images.
Release images are published only when a `v*` Git tag is pushed. Use an explicit release tag for `OMNI_VERSION`; do not use `latest`.
The Compose file pulls `ghcr.io/squatboy/omni-frontend:${OMNI_VERSION}` and `ghcr.io/squatboy/omni-backend:${OMNI_VERSION}`.

### Prerequisites
- Docker and Docker Compose installed on the host VM.
- Network access from the host VM to your Kubernetes API, GitLab, ArgoCD, Nexus, and monitored VMs.

### Step 1: Preparation

Prepare only the deploy bundle on the host VM. The full repository is not required for production deployment.

```text
/opt/omni-portal/deploy/
  docker-compose.yml
  .env
  config/inventory.json
  certs/kubernetes-ca.crt   # only when the Kubernetes API uses a private/self-signed CA
```

Copy `deploy/docker-compose.yml`, create `.env`, and place the inventory file under `config/inventory.json`.

### Step 2: Configuration

**1. Create the Environment File**

Use `deploy/.env.example` from the repository as a template, then place the completed `.env` in the deploy bundle:

Required environment variables:
- `OMNI_VERSION`: One release version tag used by both frontend and backend images (e.g., `v1.0.1`).
- `KUBERNETES_API_URL`: Your cluster's API endpoint.
- `KUBERNETES_BEARER_TOKEN`: A read-only token for the cluster.
- `GITLAB_TOKEN`: Personal Access Token for GitLab.
- `ARGOCD_TOKEN`: Authentication token for ArgoCD.

**2. Configure the Infrastructure Inventory**

Define the VMs and services you want to monitor:

```bash
# From /opt/omni-portal/deploy
mkdir -p config
vi config/inventory.json
```

Use `config/inventory.example.json` from the repository as the starting template when preparing the deploy bundle.

**3. Set Up Kubernetes Credentials**

Omni requires read-only Kubernetes access. Apply the provided RBAC manifest to the target cluster from the repository checkout or from a copied manifest file:

```bash
kubectl apply -f deploy/kubernetes/readonly-rbac.yaml
```

Extract the generated token and place it in `.env` as `KUBERNETES_BEARER_TOKEN`:

```bash
kubectl -n omni get secret omni-reader-token \
  -o jsonpath='{.data.token}' | base64 -d
```

If the Kubernetes API uses a private or self-signed CA, copy the CA certificate to `certs/kubernetes-ca.crt`.

### Step 3: Deploy

Pull the tagged release images and start the services:

```bash
cd /opt/omni-portal/deploy
docker compose pull
docker compose up -d
```

Verify the containers are running:
```bash
docker compose ps
```

## Usage

Once the containers are running, access the Omni portal via your web browser:
`http://<Server-IP>:3000`

External access should use the frontend on port 3000.
The backend is an internal Compose service and is reached by the frontend through `http://backend:8080`.

Ensure your VM's firewall allows inbound TCP traffic on port 3000.

## Local Image Verification

Use a full repository clone only when you need to validate local image builds or Dockerfile changes.

```bash
git clone https://github.com/squatboy/omni-portal.git
cd omni-portal
docker build -f frontend/Dockerfile -t omni-frontend:local frontend
docker build -f backend/Dockerfile -t omni-backend:local backend
```

This is a local verification path, not the production deployment flow.
