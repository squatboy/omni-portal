# PRD: Omni 인프라 통합 대시보드

## Problem Statement

현재 프로젝트의 VM, Kubernetes Cluster, Frontend/Backend Pod, Argo CD, GitLab, Nexus 상태가 여러 도구와
문서에 흩어져 있어 운영/개발자가 전체 상태를 한눈에 보기 어렵다.
Omni는 프로젝트 기능과 무관한 인프라 및 리소스 통합 dashboard 앱으로, 내부 운영/개발자가
VM IP와 포트로 현재 상태를 빠르게 확인하는 것을 목표로 한다.

## Solution

- **구조**: Go 기반의 고성능 백엔드(API/Collector)와 Next.js 기반의 프론트엔드 분리 구조로 만든다.
- **수집**: 데이터 수집 logic은 Go 백엔드에서 30초마다 백그라운드 폴링으로 수행하며, 결과를 in-memory 캐시에 저장한다.
- **배포**: 앱은 Kubernetes cluster 외부 VM에 Docker Compose(프론트엔드 + 백엔드)로 배포한다.
- 같은 Kubernetes cluster 안에 앱을 배포하지 않는다. 클러스터 장애 시 관측 UI/collector도 같이 죽어
  Omni의 목적과 충돌하기 때문이다.
- 앱 repo는 GitHub public repo로 관리하고, 프론트엔드/백엔드 Docker image는 같은 version tag로 public GHCR에 push한다.
- CI는 PR/main push에서 검증만 수행하고, `v*` Git tag push에서 검증 통과 후 frontend/backend release image를 publish한다.
- VM 반영은 운영자가 `deploy/.env`의 `OMNI_VERSION`을 바꾼 뒤 `docker compose pull && docker compose up -d`로 수행한다.
- Kubernetes에는 앱을 배포하지 않고 외부 collector용 read-only credential만 만든다.
- v1은 현재 상태 중심 대시보드다. 시계열 분석, 알림, 상세 로그 분석은 원본 도구로 연결한다.

## User Stories

1. 운영자는 전체 시스템 health를 첫 화면에서 보고, 장애 여부를 빠르게 판단하고 싶다.
2. 운영자는 VM 목록과 각 VM의 ping 생존 여부를 보고 싶다.
3. 운영자는 Kubernetes 노드 Ready 상태와 현재 CPU/메모리 사용량을 보고 싶다.
4. 운영자는 주요 namespace, workload, Pod Ready, restart, PVC, ingress 상태를 보고 싶다.
5. 운영자는 frontend/backend Pod 상태를 별도로 빠르게 확인하고 싶다.
6. 운영자는 Argo CD 전체 Application의 sync/health 상태와 원본 링크를 보고 싶다.
7. 개발자는 앱 repo의 최신 commit과 default branch 기준 최신 pipeline 상태를 보고 싶다.
8. 운영자는 GitLab, Nexus 같은 외부 도구가 접속 가능한지 확인하고 싶다.
9. 운영자는 각 섹션에서 원본 시스템으로 이동할 수 있는 링크를 원한다.
10. 운영자는 30초마다 자동 갱신되는 상태를 보고, 마지막 수집 시각과 수집 실패 여부를 확인하고 싶다.

## Design Details

- 제품명은 Omni로 한다.
- 앱 성격은 “dashboard 앱”으로 문서화하되, 제품명 자체에는 Dashboard를 붙이지 않는다.
- 접속 경로는 `http://<VM-IP>:3000` 직접 접속으로 한다. (프론트엔드가 백엔드 8080으로 요청을 프록시함)
- 별도 reverse proxy는 v1 배포 기준에서 제외한다.
- 화면 구조는 Overview + 섹션 탭으로 한다.
- UX/UI 상세 디자인은 후속 작업 에이전트와 별도로 결정한다.
- v1 데이터 깊이는 현재 상태 중심으로 제한한다.
- CPU/메모리는 현재 사용량만 보여준다.
- VM 상태는 ICMP ping 기반 up/down/unknown만 제공한다.
- ICMP ping을 위해 Docker Compose에서 `NET_RAW` capability를 허용한다.
- GitLab 섹션은 앱 repo만 보여준다: sth-approval-system, sth-approval-system-admin, sth-portal-member-backend.
- GitLab commit/pipeline은 각 repo의 default branch 기준으로 조회한다.
- Argo CD 섹션은 전체 Argo CD Application을 보여준다.
- Nexus 섹션은 접속 상태만 보여준다.
- 알림/통지는 MVP에서 제외하고, 추후 webhook 연동 예정으로만 기록한다.
- collect API는 Go 백엔드 collector가 만든 in-memory snapshot cache를 반환한다.
- 프론트엔드는 30초 폴링으로 Next.js 프록시를 통해 Go 백엔드 API를 호출한다.
- v1은 단일 replica 전제로 시작한다.
- 실제 inventory는 Git에 넣지 않는 local `config/inventory.json`으로 관리하고, repo에는 `config/inventory.example.json`만 추적한다.
- credential은 Git에 넣지 않는 VM `deploy/.env`로 관리한다.
- Runtime env는 `OMNI_VERSION`, `API_URL=http://backend:8080`, `KUBERNETES_API_URL`, `KUBERNETES_BEARER_TOKEN`, `GITLAB_TOKEN`, `ARGOCD_TOKEN` 등을 기준으로 한다.
- Kubernetes 조회는 `omni` namespace의 전용 read-only `ServiceAccount omni-reader`, `ClusterRole/ClusterRoleBinding`, `Secret omni-reader-token(type kubernetes.io/service-account-token)`으로 처리한다.
- Kubernetes API는 HTTP가 아니라 HTTPS와 CA 신뢰가 필요하다.
- GHCR image tag는 `v1.0.1` 같은 version tag만 사용하고 latest는 배포 기준에서 제외한다.

## Public Interfaces

- 앱 API 계약은 변경하지 않는다. (Next.js `/api/collect/*`가 Go 백엔드로 프록시됨)
- GET /api/collect/overview: 전체 health rollup, 마지막 수집 시각, 소스별 수집 상태
- GET /api/collect/vms: VM inventory, ping 상태, 마지막 확인 시각
- GET /api/collect/kubernetes: node, namespace, workload, pod, service, ingress, pvc, current resource usage
- GET /api/collect/argocd: Argo CD Application sync/health/revision/link
- GET /api/collect/gitlab: 앱 repo 링크, default branch latest commit, latest pipeline status
- GET /api/collect/nexus: Nexus 접속 상태, HTTP status, 마지막 확인 시각
- GET /api/health/ready: 앱 ready health

## Testing Decisions

- collect API는 Go 백엔드의 외부 시스템별 adapter 단위로 테스트한다.
- Kubernetes/Argo/GitLab/Nexus adapter는 mock response 기반으로 정상/실패/timeout/stale 상태를 검증한다.
- VM ping collector는 up, down, timeout, permission failure를 구분해 테스트한다.
- UI 테스트는 Overview rollup, 섹션별 상태 표시, stale/error 표시, 원본 링크 렌더링을 검증한다.
- 배포 검증은 VM `docker compose ps`, `http://<VM-IP>:3000` 접근, collect API 응답, ready health 응답 기준으로 한다.
- Kubernetes source 장애는 `down`/`timeout`/`stale`로 격리한다. 장애 중 Kubernetes 세부 수집 지속 보장은 v1 범위 밖이다.

## Out of Scope

- 인증/권한 관리 UI
- Slack/메일/webhook 알림
- Grafana 수준의 시계열 그래프와 쿼리 탐색
- Nexus artifact/image 목록 조회
- GitLab job 로그 상세 분석
- VM CPU/메모리/디스크 agent 설치
- 장기 이력 저장용 DB
- 기존 GitLab CI/Nexus 기반 Omni 배포
- Kubernetes cluster 내부 Omni 앱 배포
- Argo CD Application 기반 Omni 앱 배포
- Kubernetes 장애 중 Kubernetes 세부 리소스 수집 지속 보장

## Further Notes

- GitHub/GHCR public 배포는 가능하다. GitHub 공식 문서 기준 GHCR은 Docker/OCI image를 지원하고, GitHub Actions에서 GITHUB_TOKEN과 packages: write 권한으로 image push가 가능하다.
- 참고 문서: https://docs.github.com/en/packages/guides/about-github-container-registry
- 참고 문서: https://docs.github.com/actions/guides/publishing-docker-images
