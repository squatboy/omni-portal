# IPAM v1 구현 계획

## Summary

- IPAM은 Location -> Network -> Subnet -> IP 계층으로 추가한다.
- Network는 CIDR 소유자가 아니라 Location 내부의 논리 그룹이다.
- Admin은 생성/수정/삭제/스캔 실행 가능, Viewer는 전체 IPAM 조회만 가능하다.
- Subnet 등록 시 /24 이하 CIDR의 IP row를 자동 생성하고, Auto Discovery ON이면 주기 스캔으로 IP 상태만
갱신한다.

## Key Changes

- Backend
    - DB 테이블 추가: ipam_locations, ipam_networks, ipam_subnets, ipam_addresses.
    - Location 내부에서 Subnet CIDR overlap을 차단한다. Network가 달라도 같은 Location이면 overlap 불
    가.
    - Subnet CIDR은 생성 후 수정 불가. 변경은 cascade 삭제 후 재생성으로 처리한다.
    - Subnet 최대 크기는 /24; IPv4만 지원한다.
    - IP 상태 enum은 active, dead, offline으로 통일한다.
    - 상태 전이:
        - 최신 ping 성공: active
        - 과거 active 이력이 있고 최신 ping 연속 3회(consecutiveFailures) 실패: dead 
        - 한 번도 성공 이력이 없음: offline
    - IP 수동 필드: hostname, description.
    - 스캔 필드: Subnet에 autoDiscovery, scanIntervalSeconds, lastScanStartedAt, lastScanCompletedAt, lastScanStatus, lastScanError; IP에 lastScannedAt, lastSeenAt, consecutiveFailures.
    - 스캔 worker pool은 고정 64개.
    - Auto Discovery 주기 선택값: 30분, 1시간, 4시간, 12시간, 24시간. 기본값은 1시간.
    - 스캔은 ICMP ping으로 Active/Dead 판단만 수행한다. MAC/hostname 자동 탐지는 v1 범위에서 제외한다.
    - 스캔 결과를 배치로 모아서 한 번에 밀어 넣는 Bulk Update 로직으로 구현한다.
    - IPAM scheduler는 기존 collect runner와 분리한다.
- API
    - Viewer 조회 API: /api/ipam/*
    - Admin 수정/삭제/스캔 API: /api/manage/ipam/*
    - 주요 조회:
        - Location/Network/Subnet 목록
        - Subnet별 IP 목록
        - IPAM Home summary
    - 주요 수정:
        - Location/Network/Subnet 생성·수정·삭제
        - IP hostname/description 수정
        - Subnet 수동 rescan 실행
    - Location/Network/Subnet 삭제는 확인 후 cascade 삭제한다.
- Frontend
    - Sidebar에 IPAM Collapsible 섹션을 추가하고 하위 메뉴는 Home으로 둔다.
    - IPAM 화면은 모든 로그인 사용자에게 노출하고, Admin-only 액션 버튼만 role로 숨긴다.
    - Home:
        - 상단 탭: Location, Network, Subnet
        - 좌측: 기본 통계 + shadcn chart/Recharts 기반 “Top IPv4 subnets by number of hosts”
        - 우측: shadcn Collapsible 기반 Location -> Network -> Subnet -> IP 상태 count 트리
    - Location/Network/Subnet 생성·수정은 shadcn Sheet form으로 처리한다.
    - 삭제 확인은 shadcn AlertDialog를 추가해 대상 이름과 하위 개수를 보여준다.
    - Subnet row 선택 시 아래에 IP 상세 섹션을 펼친다.
    - IP 상세:
        - Section 1: Active/Dead IP 요약 테이블
        - Section 2: 전체 IP를 상태 색상 반영 Button grid로 표시
        - IP 버튼 클릭 시 shadcn Sheet로 상세 패널을 열고, Admin은 hostname/description 수정 가능
- Docs
    - docs/features/ipam.md를 새로 추가한다.
    - docs/ARCHITECTURE.md와 docs/ROADMAP.md에서 IPAM이 backlog가 아니라 v1 확장 기능임을 갱신한다.
    - 스캔 범위, /24 제한, Auto Discovery 주기, RBAC, cascade 삭제 정책을 문서화한다.

## Test Plan

- Backend
    - go test ./...
    - CIDR parser: IPv4 only, /24 초과 거부, invalid CIDR 거부
    - Location 내부 overlap 차단 테스트
    - Subnet 생성 시 IP row 자동 생성 테스트
    - CIDR 수정 불가 테스트
    - cascade 삭제 테스트
    - IP 상태 전이 테스트: offline -> active -> dead
    - Viewer/Admin API 권한 테스트
    - worker pool 스캔 로직은 ping executor를 인터페이스로 분리해 fake로 테스트한다.
- Frontend
    - npm run test
    - npm run typecheck
    - npm run lint
    - npm run build
    - IPAM sidebar 노출, Viewer action 숨김, Admin action 표시 테스트
    - Subnet 선택 후 IP table/grid 렌더링 테스트
    - Sheet form, AlertDialog cascade 확인 흐름 테스트
- Post-change
    - 코드 변경 후 graphify update .
    - 기능 단위로 commit 생성. git push는 하지 않는다.

## Assumptions

- v1은 IPv4만 지원한다.
- Subnet은 /24 이하만 허용한다.
- MAC address 자동 수집은 v1 범위에서 제외한다.
- hostname은 자동 discovery 대상이 아니라 Admin 수동 입력 필드다.
- 현재 단일 backend replica 전제를 유지한다.
- shadcn 신규 추가 대상은 chart, alert-dialog이며, 필요 시 사용 전 shadcn 문서/MCP로 확인한다.