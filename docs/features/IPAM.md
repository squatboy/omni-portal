# IPAM (IP Address Management)

IPAM은 `Location -> Network -> Subnet -> IP` 계층으로 IPv4 주소 자원을 관리하고, ICMP 스캔 결과를 기반으로 IP 상태를 자동으로 갱신하는 기능이다.

---

## 1. 리소스 계층 구조 및 권한

### 계층 구조 (Resource Hierarchy)
- **구조**: `Location` ➔ `Network` ➔ `Subnet` ➔ `IP Address` (PostgreSQL 저장)
- **Network**: Location 내부에 존재하는 논리적 그룹.
- **Subnet**: CIDR 블록의 소유자이며 실질적인 IP 관리가 이루어지는 단위.

### 권한 모델 (Authorization Model)
- **일반 사용자 (Viewer)**:
  - IPAM 정보 조회 가능.
  - API: `/api/ipam/*` 사용.
- **관리자 (Admin)**:
  - 생성, 수정, 삭제, 수동 재스캔(Rescan), IP 메타데이터 편집 가능.
  - API: `/api/manage/ipam/*` 사용.

---

## 2. 스캔 메커니즘 (Scanning Mechanism)

### 스캔 실행 및 상태 판별 규칙
- **실행 경계**: `ScanExecutor`가 수동 재스캔(`RescanSubnet`)과 스케줄 스캔(`ScanDue`)의 공통 진입점임.
- **스캔 동작**: `Prober` adapter가 OS `ping` 명령을 실행하고, worker pool(크기 `64` 고정)을 통해 ICMP ping 스캔 수행.
- **상태 판별**:
  - **Ping 성공**: IP 상태가 `used`로 갱신되며, `consecutiveFailures`는 0으로 초기화됨.
  - **Ping 실패**: `consecutiveFailures`가 1씩 증가함.
    - **과거 성공 이력이 있는 IP**: 3회 연속 실패 시 `offline` 상태로 전환됨.
    - **성공 이력이 없는 IP**: 실패하더라도 `free` 상태 유지.
- **스캔 라이프사이클 속성**: Subnet의 `lastScanStartedAt`, `lastScanCompletedAt`, `lastScanStatus`, `lastScanError` 필드를 사용하여 추적함.
- **실행권한(Lease)**: 스캔 시작 시 `subnetId + startedAt` lease를 잡고, 완료/실패 반영 시 같은 lease인지 확인함. 지연된 이전 스캔 결과는 최신 스캔 결과를 덮어쓰지 않음.
- **스케줄러**: IPAM scheduler는 기존 dashboard collect runner와 별도로 실행되며, due subnet 조회/claim/skip 처리는 `ScanExecutor.ScanDue` 내부 계약으로 캡슐화됨.

---

## 3. 스캔 히스토리 (Scan History)

스캔 완료 시 결과 요약과 상태 변경 이력을 효율적으로 기록하고 보존하는 기능이다.

### 데이터 저장 구조
스캔 결과는 대용량 업데이트(Bulk Update) 중 트랜잭션을 통해 두 테이블에 나누어 기록한다.
- 완료 처리 트랜잭션은 IP 주소 bulk update, Subnet scan status 갱신, scan history summary/change row 기록, retention pruning을 함께 커밋한다.
- 실패 처리 트랜잭션은 Subnet failed status, 실패 history row, retention pruning을 함께 커밋한다.

1. **`ipam_scan_history` (스캔 요약)**
   - 완료된 모든 스캔에 대해 Subnet별 스캔 요약 행(Row)을 저장함.
   - 실패한 스캔의 경우, 에러 메시지와 발생 시각만 기록하며 count 및 변경 내역(diff) 정보는 비워둔다.
2. **`ipam_scan_history_changes` (상태 변경 내역)**
   - 스캔 중 IP 상태가 변경된 주소(예: `free -> used` 또는 `used -> offline`)만 기록함.
   - **이전 상태 ➔ 현재 상태**의 변경 내역(diff)을 저장한다.
   - 전후 상태 값과 함께 `lastSeenAt`, `consecutiveFailures`의 변경 전후 값도 기록함.
   - *주의: 데이터 효율성을 위해 전체 IP 스냅샷은 보관하지 않는다.*

### 이력 보존 정책 (Retention Policy)
- **최근 20개 제한**: 각 Subnet별로 최근 20개의 히스토리 행만 유지함.
- **자동 물리 삭제**: 새로운 히스토리 행이 추가될 때, 해당 Subnet의 오래된 초과 히스토리(20개 초과분)는 자동으로 데이터베이스에서 물리 삭제(Hard Delete)됨.

### Frontend 표현 및 UX
- **메뉴 노출**: Sidebar에 Collapsible 섹션 아래 `Scan History` 메뉴 제공 (모든 로그인 사용자 접근 가능).
- **이력 목록**: 최근 스캔 요약 목록을 테이블 형식으로 제공함.
- **이력 확장(Accordion)**: 특정 스캔 행을 클릭하여 펼쳤을 때 다음 세부 정보를 표시함:
  - 스캔 상태별 IP 개수 (count)
  - 발생한 스캔 에러 (error)
  - IP 상태 전이 목록 (status transitions)
- **변경 없음 대응**: 스캔 중 상태가 변경된 IP가 없는 경우, 빈 화면 대신 `No status changes.` 메시지를 표시함.

---

## 4. 백엔드 제약 사항 및 예외 처리

### 데이터 정합성 제약
- **CIDR 제약**: Subnet CIDR은 IPv4만 허용하며, `/24`보다 큰 범위(예: `/23`, `/16` 등)는 등록을 거부함.
- **중복 방지**: 동일한 Location 내에서는 Network가 다르더라도 Subnet CIDR이 겹칠 수 없음.
- **수정 불가**: Subnet CIDR은 생성된 후 수정할 수 없음. 변경 시 삭제 후 재생성해야 함.
- **자동 IP 생성**: Subnet 생성 시 해당 CIDR 범위 내에 사용 가능한 모든 host IP row가 자동으로 테이블에 삽입됨.
- **연쇄 삭제**: Location, Network, Subnet 삭제 시 PostgreSQL 외래 키(FK) Cascade 설정을 통해 하위 데이터가 함께 삭제됨.
- **주기 설정**: Auto Discovery 실행 주기는 `1800`, `3600`, `14400`, `43200`, `86400`초 중 하나만 허용하며, 기본값은 `3600`초임.

### 예외 및 동시성 제어
- **타임아웃**: 컨텍스트 타임아웃 2초 및 OS별 ping 옵션을 통한 응답 대기 타임아웃 1초 적용.
- **동시 스캔 차단**: 이미 스캔이 실행 중인 Subnet에 중복 요청이 들어오는 경우 `409 Conflict` 에러를 반환함.
- **강제 재스캔**: 스캔이 비정상적으로 멈추는 상황을 대비해, 스캔 시작 후 15분이 지난 Subnet에 대해서는 중복 실행 차단을 우회하고 강제 재스캔을 허용함.
- **상태 꼬임 방지 (결과 덮어쓰기 방지)**: 지연된 이전 스캔(A)이 더 늦게 끝났더라도, 이미 최신 스캔(B)의 결과가 DB에 반영된 상태라면 스캔 A의 결과는 무시하고 스킵함.

---

## 5. Frontend UI/UX 디자인 사양

### 레이아웃 및 내비게이션
- **Sidebar**: IPAM Collapsible 섹션 내에 `Home`과 `Scan History` 두 가지 메뉴를 제공함.
- **IPAM Home**: 
  - Location, Network, Subnet 세 가지 탭 구조 제공.
  - **좌측 영역**: 기본 통계 및 Recharts 기반 `Top IPv4 subnets by number of hosts` 차트 노출.
  - **우측 영역**: Collapsible 구조로 구현된 `Location ➔ Network ➔ Subnet ➔ IP 상태 카운트` 트리 뷰 제공.

### 관리 기능 및 폼(Form)
- **컴포넌트**: 리소스 생성/수정은 shadcn Sheet 컴포넌트를 사용한 폼으로 처리.
- **삭제 확인**: shadcn AlertDialog를 통해 삭제 대상 이름과 연쇄 삭제될 하위 리소스 개수를 함께 노출함.
- **버튼 툴팁**: Actions 열의 버튼들(Scan, Edit, Delete)에 마우스 호버 시 직관적인 툴팁 힌트를 제공함.

### IP 그리드 및 상세 정보
- **상세 표출**: Subnet 선택 시 하단에 IP 상태 요약 테이블 및 IP 버튼 그리드 노출.
- **그리드 정렬 및 라벨**:
  - IPv4 숫자 순서로 정렬.
  - 라벨은 마지막 옥텟만 표시 (예: `.1`, `.200`).
  - 모든 버튼은 가로 길이 `4rem` (`w-16`) 고정 너비로 통일하여 정렬 일관성 유지.
- **상태 표시**:
  - `used`: 초록색 상태 표시 (`--status-ok` 변수 활용).
  - `offline`: 빨간색 상태 표시 (destructive 테마).
  - `reserved`: 주황색 상태 표시 (`--status-warn` 변수 활용).
- **IP 상세 Sheet**: 
  - 버튼 클릭 시 detail Sheet가 열리며, admin 권한이 있으면 hostname, description 및 status를 수정할 수 있음.
  - 수동으로 오버라이드된 IP에는 `Manual Override` 배지가 노출됨.

### Frontend 표현 및 UX 세부 내용
- Sidebar에 IPAM Collapsible 섹션과 Home, Scan History 메뉴를 제공함.
- IPAM Home은 모든 로그인 사용자에게 노출한다.
- Scan History는 모든 로그인 사용자에게 노출한다.
- Admin 전용 생성, 수정, 삭제, rescan, IP metadata/status 편집 기능은 viewer에게 숨긴다.
- Actions 버튼들(Scan, Edit, Delete)에는 hover 시 직관적인 설명을 제공하는 Tooltip을 추가한다.
- Home은 Location, Network, Subnet 탭을 제공한다.
- 좌측 영역은 기본 통계와 shadcn Chart/Recharts 기반 `Top IPv4 subnets by number of hosts`를 보여준다.
- 우측 영역은 shadcn Collapsible 기반 Location -> Network -> Subnet -> IP 상태 count 트리를 보여준다.
- Location, Network, Subnet 생성/수정은 shadcn Sheet form으로 처리한다.
- 삭제 확인은 shadcn AlertDialog에서 대상 이름과 cascade 하위 개수를 보여준다.
- Subnet row 선택 시 IP 상세 섹션을 표시한다.
- IP 상세는 used/offline/free/reserved 요약 table과 상태 색상 Button grid를 제공한다.
- IP 상세 Button grid는 IPv4 숫자순으로 정렬하고, 버튼 라벨은 마지막 octet만 `.1` 형식으로 표시한다. 모든 버튼의 가로 길이는 IP 3자릿수 label(예: `.200`)에 맞추어 `4rem` (`w-16`) 고정 너비로 통일하고 가운데 정렬한다.
- used 상태 badge와 IP 버튼은 `--status-ok` 기반 초록 상태 표시를 사용하고, offline은 destructive/red 표시를 유지하며, reserved는 `--status-warn` 기반 주황색 표시를 사용한다.
- IP 버튼 클릭 시 Sheet detail을 열고, admin은 hostname/description/status를 수정할 수 있다.
- Scan History는 최근 scan summary를 table row로 보여주고 row 확장 시 count, error, status transition 목록을 보여준다.
- 변경된 IP가 없으면 `No status changes.` 빈 상태를 표시한다.

---

## 6. IP 예약 및 수동 상태 오버라이드 (Manual Override)

### 1) IP 예약
- **`reserved` 상태**: "미할당이지만 미리 예약된 IP"를 표현하는 상태 값 (주황색 배지 적용).
- **수동 상태 변경**: Admin은 IP 상세 편집에서 `used`, `reserved`, `free` 상태를 임의로 오버라이드할 수 있음.

### 2) 오버라이드 구조
- Admin이 `used` 혹은 `reserved`로 상태 변경 시 `is_override = true`가 되며, 자동 ping 스캐너는 해당 주소의 상태(status)와 연속 실패 횟수(consecutive_failures)를 덮어쓰지 않고 고정함. (핑 성공 시 `last_seen_at` 등 타임스탬프 정보는 최신화됨)
- Admin이 상태를 `free`로 지정 시 `is_override = false`로 리셋되어 다음 스캔 주기부터 자동 ping 스캔 결과를 따르게 됨.

### 3) "다음 사용 가능 IP" 조회 API
- **Endpoint**: `GET /api/ipam/subnets/:id/next-available?limit=N`
- **Description**: Subnet 내에서 `free` 상태인 빈 IP 목록을 오름차순 정렬하여 최대 `limit` (기본 5, 최대 100) 개수만큼 반환.
- **Response**: `{ "addresses": ["10.40.0.3", "10.40.0.4", ...] }`
