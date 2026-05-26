## Summary

- IPAM 사이드바에 Scan History를 Home 아래에 추가하고, 별도 ipam-scan-history view로 보여준다.
- 백엔드는 scan 단위 summary row와 변경된 IP diff만 저장한다. 전체 IP 스냅샷은 저장하지 않는다.
- 보존 정책은 subnet별 최근 20개 history만 유지하고, 새 scan row 저장 후 초과분은 물리 삭제한다.
- completed/failed scan 모두 history에 표시한다. failed row는 에러와 시각을 보여주고 count/diff는 비운다.

## Key Changes

- DB에 ipam_scan_history와 ipam_scan_history_changes 테이블을 추가한다.
    - history: subnet, started/completed time, scan status, used/offline/free/total count, error.
    - changes: address, previous status, current status, previous/current lastSeenAt, previous/current
    consecutiveFailures.
- scanner bulk apply 흐름에서 기존 ipam_addresses 상태와 새 scan result를 비교해 변경분을 만든 뒤, address
update와 history 저장을 같은 transaction에서 처리한다.
- MarkIPAMScanFailed에서도 failed history row를 남긴다.
- 조회 API는 로그인 사용자용으로 추가한다.
    - GET /api/ipam/scan-history?limit=20
    - GET /api/ipam/scan-history/:id
- 프론트는 AppView에 ipam-scan-history를 추가하고, sidebar IPAM collapsible 아래에 Home, Scan History 순서로
노출한다.
- Scan History 화면은 shadcn Card, Badge, Collapsible, Table을 사용한다.
    - row: subnet CIDR/name, scan 시각, scan status, used/offline/free badge.
    - row expand: total/count 통계, error, 변경된 IP 목록을 old -> new 형태로 표시.
    - 변경 내역이 없으면 “No status changes.” 수준의 빈 상태만 보여준다.

## Tests

- backend store test:
    - completed scan 저장 시 summary count와 changed IP diff가 기록되는지 검증.
    - unchanged IP는 change row에 저장되지 않는지 검증.
    - subnet별 20개 초과 history가 prune되는지 검증.
    - failed scan도 history row로 남는지 검증.
- backend API test:
    - /api/ipam/scan-history는 auth 필요.
    - viewer도 조회 가능.
    - 없는 history id는 404.
- frontend unit test:
    - history count badge helper.
    - status transition label/helper.
    - sidebar view resolution에 ipam-scan-history 포함.
- 검증 명령:
    - backend: go test ./..., go build ./cmd/server
    - frontend: npm run test, npm run typecheck, npm run lint, npm run build
    - code 변경 후 graphify update .
    - docs 변경 후 git diff --check

## Docs And Commit

- docs/features/IPAM.md에 Scan History 저장 방식, API, 보존 정책, UI 동작을 업데이트한다.
- 필요하면 docs/ARCHITECTURE.md에도 IPAM history 테이블/흐름만 짧게 반영한다.
- 변경 완료 후 적절한 단위로 commit만 한다. push는 하지 않는다.

## Assumptions

- 보존 개수 20은 v1에서 코드 상수로 둔다. 운영 중 조정 요구가 생기면 env 설정으로 확장한다.
- history 조회는 로그인 사용자 전체에게 허용하고, scan 실행 권한은 기존처럼 admin 전용으로 유지한다.
- “이전 상태와 변경”은 scan 직전 ipam_addresses 상태와 scan 결과를 비교한다.
- history detail은 변경된 IP만 보여준다. 과거 특정 scan 시점의 전체 IP 상태 재현은 v1 범위 밖이다.