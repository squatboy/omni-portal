# ROADMAP: Omni

## 기준

- 입력 문서: `docs/PRD.md`
- 목표: VM IP와 포트로 인프라 현재 상태를 빠르게 확인하는 v1 대시보드 구현
- 범위: 현재 상태 중심 dashboard, collect API, 외부 VM Docker Compose 배포 준비
- 제외: 인증/권한 UI, 알림, 시계열 분석, 상세 로그 분석, 장기 저장 DB

## 전제

- **구조**: Go 백엔드(API/Collector) + Next.js 프론트엔드 분리 구조.
- 화면은 Next.js에서 제공하며, 백엔드 API 호출은 Next.js `rewrites` 프록시를 통해 Go 서버(8080)로 전달된다.
- v1은 단일 replica + Go 백엔드의 in-memory snapshot cache 전제로 시작한다.
- 앱은 Kubernetes cluster 외부 VM에 Docker Compose로 배포한다.
- 실제 inventory는 Git에 넣지 않는 local `config/inventory.json`으로 관리하고, repo에는 `config/inventory.example.json`만 추적한다.
- credential은 Git에 넣지 않고 VM `deploy/.env` 및 secret mount로만 주입한다.
- 프론트엔드/백엔드 배포 image는 같은 GHCR version tag를 사용한다.
- CI는 PR/main push에서 검증만 수행하고, `v*` Git tag push에서 frontend/backend image publish를 수행한다.
- Kubernetes/Argo CD 조회에는 전용 read-only ServiceAccount와 ClusterRole/Binding이 필요하다.

## 작업 순서

### 1. 앱/데이터 계약 고정

- 상태: 완료 (`2026-05-12`)
- collect API 응답 타입을 먼저 정의한다.
- Overview rollup, source 수집 상태, stale/error 표현 규칙을 정한다.
- VM, Kubernetes, Argo CD, GitLab, Nexus inventory config 형식을 정한다.

### 2. Overview + 섹션 탭 UI 골격 구현

- 상태: 완료 (`2026-05-12`)
- Overview 첫 화면을 구현한다.
- VM, Kubernetes, Pods, Argo CD, GitLab, Nexus 섹션 탭을 만든다.
- 30초 폴링, 마지막 수집 시각, source별 실패/stale 표시를 붙인다.

### 3. Collector runtime과 adapter 공통 구조 구현 (Initial TS)

- 상태: 완료 (`2026-05-12`)
- TypeScript 기반의 초기 collector 및 adapter 구조 구현.

### 4. HTTP 기반 외부 source 연결 (Initial TS)

- 상태: 완료 (`2026-05-12`)
- Nexus, GitLab adapter 구현 및 검증.

### 5. Kubernetes/Argo CD source 연결 (Initial TS)

- 상태: 완료 (`2026-05-12`)
- Kubernetes 리소스 및 Argo CD Application 연동.

### 6. VM ping source 연결 (Initial TS)

- 상태: 완료 (`2026-05-12`)
- ICMP ping 기반 VM 상태 수집 구현.

### 7. 백엔드 Go 마이그레이션

- 상태: 완료 (`2026-05-19`)
- 고성능 및 동시성 처리를 위해 기존 TypeScript 백엔드 logic을 Go로 이관.
- Go Gin 프레임워크 기반 API 서버 및 background collector 구현.
- Next.js `rewrites`를 통한 API 프록시 설정.
- Docker Compose 구조를 Multi-container(frontend, backend)로 변경.

검증:
- Go 백엔드 유닛 테스트 통과
- `npm run typecheck` 통과 (프론트엔드 타입 정렬)
- Docker Compose를 통한 e2e 동작 확인

### 8. 배포 파이프라인과 VM Compose 배포 준비

- 상태: 완료 (`2026-05-19`)
- GitHub Actions frontend/backend 검증 및 `v*` tag 기반 image publish 워크플로우 최신화.
- VM에서의 `docker compose pull && up -d` 절차 문서화 (`README.md`).

### 9. MVP 안정화 및 Kubernetes 수집 보강

- 상태: 진행 중
- Go Kubernetes adapter의 세부 fetching logic 보강 (현재 skeleton 구현).
- 전체 시스템 통합 테스트 및 안정화.

## 우선순위

1. Go 백엔드 안정화 및 Kubernetes logic 완성
2. 배포 가이드 최신화 및 배포 검증
3. UI 피드백 반영 및 버그 수정

## 후속 backlog

- webhook 기반 알림 연동
- 시계열 저장 및 추세 화면
- GitLab job 로그 상세 분석
- Nexus artifact/image 목록 조회
- VM agent 기반 CPU/메모리/디스크 수집
- 인증/권한 관리 UI
