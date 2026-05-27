# PRD: Omni 인프라 및 IPAM 통합 대시보드

## Problem Statement
- VM, Kubernetes, Argo CD, GitLab, Nexus, IPAM 자원 상태가 분산되어 관리 효율이 저하됨.
- 한눈에 리소스 상태와 IP 할당 현황을 확인하고, UI에서 대상을 유연하게 제어하는 관리 도구가 필요함.

## Solution
- **구조**: Go 백엔드(API/Collector) 및 Next.js 프론트엔드 분리 구조.
- **수집**: 
  - 외부 도구: 백엔드에서 30초 주기 백그라운드 폴링 후 In-memory 캐시 저장.
  - IPAM: ICMP Ping 기반 백그라운드 스캔(Auto Discovery) 및 PostgreSQL 영속화.
- **배포**: Kubernetes 외부 VM에 Docker Compose로 단일 레플리카 배포 (K8s 장애 시 관측 보장).
- **보안/설정**: PostgreSQL을 단일 진실 공급원(SoT)으로 사용하며, credential은 AES-256-GCM 암호화 저장.

## User Stories
1. **대시보드**: 전체 인프라 health 요약 및 외부 링크 이동.
2. **리소스 수집**: VM 생존(Ping), K8s 노드/Pod 상태, Argo CD 앱 상태, GitLab 파이프라인, Nexus 접속 상태 확인.
3. **IPAM 관리**: 
  - `Location -> Network -> Subnet -> IP Address` 계층 구조 기반 IP 자원 시각화.
  - Subnet 생성 시 사용 가능한 Host IP 행 자동 생성 및 스캔.
  - IPAM 스캔 이력(Summary 및 IP 상태 변경 로그) 확인.
4. **설정/권한**: UI를 통한 VM/인프라/IPAM 연동 등록. Admin(변경/재스캔)과 Viewer(조회 전용) 권한 분리.

## Design Details
- **IPAM 스캔**:
  - ICMP ping 기반으로 IP 상태(`up`, `down`, `unknown`) 식별.
  - IPAM 스케줄러가 주기적으로 자동 스캔을 수행하며, UI를 통한 수동 즉시 재스캔 제공.
  - 스캔 시 전체 IP 스냅샷을 저장하지 않고, 스캔 이력 요약 및 상태 변경 내역(diff)만 트랜잭션으로 저장.
- **배포/네트워크**: Docker Compose 상에서 ICMP ping 동작을 위해 `NET_RAW` capability 부여.

## Public Interfaces
- **인증 및 계정**: POST `/api/auth/setup`, `/api/auth/login`, `/api/auth/logout`, GET `/api/auth/me`
- **인프라 설정**: `/api/manage/resources/vms`, `/api/manage/integrations/{kubernetes,gitlab,argocd,nexus}`
- **대시보드 수집**: GET `/api/collect/snapshot` (전체 snapshot), `/api/collect/snapshot?force=true` (즉시 갱신)
- **IPAM 조회 (Viewer/Admin)**:
  - GET `/api/ipam/summary` (IPAM 요약)
  - GET `/api/ipam/scan-history`, `/api/ipam/scan-history/:id` (스캔 이력 및 상세)
  - GET `/api/ipam/{locations,networks,subnets}` (IPAM 계층 목록 조회)
  - GET `/api/ipam/subnets/:id/addresses` (특정 Subnet IP 주소 목록 조회)
- **IPAM 관리 (Admin)**:
  - POST/PUT/DELETE `/api/manage/ipam/locations`
  - POST/PUT/DELETE `/api/manage/ipam/networks`
  - POST/PUT/DELETE `/api/manage/ipam/subnets`
  - POST `/api/manage/ipam/subnets/:id/rescan` (수동 재스캔 실행)
  - PUT `/api/manage/ipam/addresses/:id` (IP 세부 정보 수정)

## Testing Decisions
- IPAM 스캔 로직은 ICMP ping 결과(정상, 실패, 권한 에러 등)에 따른 IP 상태 천이 검증.
- Mock DB와 Mock Ping Executor를 활용하여 IPAM 스캔 요약 및 변경 로그 생성 트랜잭션 테스트.

## Out of Scope
- 알림 서비스 (Slack/이메일/Webhook 등)
- Grafana 수준의 시계열 메트릭 시각화
- K8s 내부 또는 Argo CD 기반의 Omni 자체 배포