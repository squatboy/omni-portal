# IPAM

IPAM은 Location -> Network -> Subnet -> IP 계층으로 IPv4 주소 자원을 관리하고, ICMP 스캔 결과로 IP 상태를 갱신하는 기능이다.

## Scope

- 데이터는 PostgreSQL에 `Location -> Network -> Subnet -> IP Address` 구조로 저장한다.
- Network는 Location 내부의 논리 그룹이며, CIDR 소유자는 Subnet이다.
- 조회 API는 로그인 사용자에게 열려 있고 `/api/ipam/*`를 사용한다.
- 생성, 수정, 삭제, rescan API는 admin 전용이며 `/api/manage/ipam/*`를 사용한다.
- v1 스캔은 ICMP ping으로 used/offline/free 상태만 판단한다.
- MAC address와 hostname 자동 탐지는 v1 범위에서 제외한다. hostname은 admin 수동 입력 필드다.

## Backend

- Subnet CIDR은 IPv4만 허용하고 `/24`보다 큰 범위는 거부한다.
- 같은 Location 안에서는 Network가 달라도 Subnet CIDR overlap을 허용하지 않는다.
- Subnet CIDR은 생성 후 수정할 수 없고, 변경은 삭제 후 재생성으로 처리한다.
- Subnet 생성 시 사용 가능한 host IP row를 자동 생성한다.
- Location, Network, Subnet 삭제는 PostgreSQL FK cascade로 하위 row까지 삭제한다.
- Auto Discovery interval은 `1800`, `3600`, `14400`, `43200`, `86400`초만 허용하고 기본값은 `3600`초다.

## Scanning

- scanner worker pool 크기는 `64`로 고정한다.
- ping 성공 시 IP 상태는 `used`가 되고 `consecutiveFailures`는 0으로 초기화된다.
- ping 실패 시 `consecutiveFailures`를 증가시킨다.
- 과거 성공 이력이 있는 IP는 3회 연속 실패 후 `offline`이 된다.
- 성공 이력이 없는 IP는 실패해도 `free` 상태를 유지한다.
- scan lifecycle은 Subnet의 `lastScanStartedAt`, `lastScanCompletedAt`, `lastScanStatus`, `lastScanError`로 추적한다.
- scan 결과는 store bulk update 경로에서 트랜잭션으로 반영한다.
- completed scan은 `ipam_scan_history`에 summary row를 저장한다.
- IP 상태가 바뀐 주소만 `ipam_scan_history_changes`에 `previous -> current` diff로 저장한다.
- history change row에는 status 전후 값과 전후 `lastSeenAt`, `consecutiveFailures`를 함께 기록한다.
- 전체 IP 스냅샷은 저장하지 않는다.
- failed scan도 history row로 저장하되, error와 시각만 남기고 count/diff는 비워둔다.
- history 보존 정책은 subnet별 최근 20개이며, 새 history row 저장 후 초과분은 물리 삭제한다.
- IPAM scheduler는 기존 dashboard collect runner와 별도로 실행된다.

## Exception handling

- 2초의 컨텍스트 타임아웃과 OS별 ping 명령 옵션으로 1초의 응답 대기 타임아웃이 적용.
- 이미 실행 중인 스캔에 대한 중복 요청은 차단하고 409 Conflict 에러 반환.
- 비정상 중단을 대비해 스캔 시작 후 15분이 경과한 경우는 강제 재스캔 허용.
- **스캔 결과 덮어쓰기 방지 (상태 꼬임 방지)**: 지연된 이전 스캔(A)이 나중에 끝났을 때, 더 최신 스캔(B)의 결과가 이미 반영되어 있다면 A의 결과를 반영하지 않고 스킵하여 상태 꼬임을 방지함.

## API

- `GET /api/ipam/summary`
- `GET /api/ipam/locations`
- `GET /api/ipam/networks?locationId=...`
- `GET /api/ipam/subnets?locationId=...&networkId=...`
- `GET /api/ipam/subnets/:id/addresses`
- `GET /api/ipam/scan-history?limit=20`
- `GET /api/ipam/scan-history/:id`
- `POST /api/manage/ipam/locations`
- `PUT /api/manage/ipam/locations/:id`
- `DELETE /api/manage/ipam/locations/:id`
- `POST /api/manage/ipam/networks`
- `PUT /api/manage/ipam/networks/:id`
- `DELETE /api/manage/ipam/networks/:id`
- `POST /api/manage/ipam/subnets`
- `PUT /api/manage/ipam/subnets/:id`
- `DELETE /api/manage/ipam/subnets/:id`
- `POST /api/manage/ipam/subnets/:id/rescan`
- `PUT /api/manage/ipam/addresses/:id`

## Frontend

- Sidebar에 IPAM Collapsible 섹션과 Home, Scan History 메뉴를 추가한다.
- IPAM Home은 모든 로그인 사용자에게 노출한다.
- Scan History는 모든 로그인 사용자에게 노출한다.
- Admin 전용 생성, 수정, 삭제, rescan, IP metadata 편집 버튼은 viewer에게 숨긴다.
- Actions 버튼들(Scan, Edit, Delete)에는 hover 시 직관적인 설명을 제공하는 Tooltip(Scan, Edit, Delete)을 추가한다.
- Home은 Location, Network, Subnet 탭을 제공한다.
- 좌측 영역은 기본 통계와 shadcn Chart/Recharts 기반 `Top IPv4 subnets by number of hosts`를 보여준다.
- 우측 영역은 shadcn Collapsible 기반 Location -> Network -> Subnet -> IP 상태 count 트리를 보여준다.
- Location, Network, Subnet 생성/수정은 shadcn Sheet form으로 처리한다.
- 삭제 확인은 shadcn AlertDialog에서 대상 이름과 cascade 하위 개수를 보여준다.
- Subnet row 선택 시 IP 상세 섹션을 표시한다.
- IP 상세는 used/offline/free 요약 table과 상태 색상 Button grid를 제공한다.
- IP 상세 Button grid는 IPv4 숫자순으로 정렬하고, 버튼 라벨은 마지막 octet만 `.1` 형식으로 표시한다. 모든 버튼의 가로 길이는 IP 3자릿수 label(예: `.200`)에 맞추어 `4rem` (`w-16`) 고정 너비로 통일하고 가운데 정렬한다.
- used 상태 badge와 IP 버튼은 `--status-ok` 기반 초록 상태 표시를 사용하고, offline은 destructive/red 표시를 유지한다.
- IP 버튼 클릭 시 Sheet detail을 열고, admin은 hostname/description을 수정할 수 있다.
- Scan History는 최근 scan summary를 table row로 보여주고 row 확장 시 count, error, status transition 목록을 보여준다.
- 변경된 IP가 없으면 `No status changes.` 빈 상태를 표시한다.