# ARCHITECTURE.md

## System Overview & Constraints

Omni는 가상 머신(VM), Kubernetes 클러스터, 주요 개발 도구(ArgoCD, GitLab, Nexus), 그리고 IPAM 주소 자원의 상태를 한곳에서 모니터링하고 관리할 수 있는 통합 웹 포털입니다.

- **핵심 목적**: 분산된 인프라 및 도구의 상태 가시성 통합
- **제약 조건**: 
  - 외부 시스템 API의 지연 시간이 사용자 경험(UX)에 영향을 주지 않아야 함.
  - 연동을 위한 민감 정보(API Token 등)는 철저히 암호화하여 보호해야 함.
  - 최소한의 리소스로 높은 응답 성능을 유지해야 함.

## Core Design Principles

1. **Performance over Absolute Real-time**: 30초 주기의 백그라운드 동기화를 통해 외부 API 지연을 사용자 요청 경로에서 격리합니다.
2. **Security-by-Design**: 데이터베이스에는 평문 자격 증명을 저장하지 않으며, 메모리 내에서도 필요한 순간에만 복호화하여 사용합니다.
3. **Decoupled Architecture**: 수집 엔진(Collector)과 API 서버는 서로 독립적으로 동작하며, 인메모리 캐시를 통해서만 데이터를 공유합니다.
4. **Consistency in UI**: 모든 외부 시스템의 다양한 상태값을 Omni 표준 상태 모델로 정규화하여 일관된 시각적 피드백을 제공합니다.

## Technology Stack & Rationale

- **Frontend**: Next.js 16.2.6 (App Router), React 19, Tailwind CSS 4, shadcn/ui
  - **이유**: App Router를 통한 최적화된 라우팅과 shadcn/ui 기반의 일관된 디자인 시스템을 통해 개발 생산성과 사용자 경험을 동시에 확보합니다.
- **Backend**: Go 1.25.0, Gin Framework
  - **이유**: 강력한 정적 타입 시스템과 고루틴(Goroutine)을 이용한 병렬 수집 로직 구현에 최적화되어 있습니다. Gin은 미니멀한 설계로 오버헤드를 줄입니다.
- **Database**: PostgreSQL (pgx/v5)
  - **이유**: 복잡한 관계형 데이터(사용자, 권한, 연동 설정)를 안정적으로 관리하고 암호화된 바이너리 데이터를 저장하기에 적합합니다.
- **Cache**: Go In-memory Cache
  - **이유**: Redis와 같은 외부 캐시 시스템 없이도 충분한 성능을 보장하며, 아키텍처 복잡도를 낮추고 배포 편의성을 극대화합니다.


## High-Level Data & Request Flow

### Data Collection & Normalization (Push to Cache)

1. `Runner`가 30초마다 수집 설정 데이터를 로드합니다.
2. 각 연동 대상에 대해 고루틴이 독립적인 `Collector`를 실행합니다.
3. 수집된 이질적인 데이터(K8s Pod, ArgoCD App 등)는 표준 상태 모델로 정규화됩니다.
4. 정규화된 데이터는 인메모리 `Cache`에 저장됩니다.

### IPAM Scan Path (Database-backed)

1. IPAM 자원은 PostgreSQL에 `Location -> Network -> Subnet -> IP Address` 계층으로 저장됩니다.
2. Subnet 생성 시 IPv4 CIDR의 사용 가능한 host IP row를 생성합니다.
3. IPAM scanner는 ICMP ping 결과를 수집하고 store bulk update 경로로 IP 상태를 반영합니다.
4. IPAM scheduler는 dashboard collect runner와 별도로 due Auto Discovery Subnet을 스캔합니다.
5. Viewer는 `/api/ipam/*` 조회 API만 사용하고, Admin은 `/api/manage/ipam/*` mutation과 rescan API를 사용합니다.

### User Request Path (Pull from Cache)

1. 사용자가 페이지 접속 시 대시보드 API를 호출합니다.
2. API 핸들러는 DB를 거치지 않고 즉시 `Cache`에서 데이터를 조회합니다.
3. 정규화된 데이터를 반환하여 네트워크 지연 없는 빠른 화면 렌더링을 구현합니다.

## Security Architecture

- **Credential Storage**: AES-256-GCM 알고리즘을 사용하며, `integration_type:integration_id:secret_name`을 AD(Additional Data)로 사용하여 데이터 변조를 방지합니다.
- **Session Management**: DB 기반의 세션 관리와 토큰 해싱을 통해 세션 보안을 강화합니다.
- **Access Control**: Admin과 Viewer 역할을 구분하여 인프라 설정 수정 권한을 제어합니다.


## Architectural Patterns

### 1. Backend: Layered Architecture

백엔드는 책임 분리를 위해 명확한 레이어로 구분되어 있습니다.
- **API Layer (`internal/api`)**: HTTP 요청 핸들링 및 JSON 직렬화/역직렬화 담당
- **Collector Layer (`internal/collector`)**: 외부 시스템별 수집 로직 및 데이터 정규화 담당
- **Store Layer (`internal/store`)**: PostgreSQL 접근, 트랜잭션 처리, 자격 증명 암/복호화 담당
- **IPAM Layer (`internal/ipam`)**: ICMP scanner, fixed worker pool, Auto Discovery scheduler 담당
- **Models (`internal/models`)**: 전 계층에서 공유되는 도메인 모델 및 타입 정의

### 2. Frontend: Modular Component Architecture

- **Panels**: 각 외부 도구별 독립적인 대시보드 위젯 구성
- **Shared Components**: 차트, 지표 카드, 상태 배지 등 재사용 가능한 UI 요소
- **Lib/Hooks**: API 통신 및 클라이언트 측 상태 관리 로직 분리
