# Manage CRUD

관리자가 웹 UI를 통해 가상 머신(VM) 및 외부 연동 도구(Kubernetes, GitLab, ArgoCD, Nexus) 설정과 사용자 정보를 등록/수정/삭제하는 관리 기능

## 기능 동작 방식 및 플로우

1. **메뉴 진입**: 사이드바의 Manage 메뉴를 통해 가상 머신, 연동 도구(Integrations), 사용자(Users) 중 하나를 선택.
2. **설정 등록/수정**: UI 폼에 정보를 입력하여 전송하면 서버는 중요 Credential을 즉시 암호화하여 DB에 영구 저장.
3. **연결성 검증 (Test Connection)**: 설정 수정 화면이나 목록에서 `Test connection`을 실행하여 외부 API가 제대로 동작하는지 수동으로 확인.
4. **설정 비활성화 및 삭제**: 설정에서 active 여부를 토글하여 일시 중단하거나, 완전히 삭제하여 DB 레코드를 제거할 수 있음.

## 기능 구현 방식

- **PostgreSQL 단일 Source of Truth**: 기존의 로컬 파일 설정 방식(`inventory.json`)을 완전히 제거하고 PostgreSQL 데이터베이스를 설정 데이터의 단일 진실 공급원(Source of Truth)으로 일원화함.
- **자격 증명(Credential) 대칭 암호화**: Kubernetes Token, GitLab Token 등의 중요 정보는 DB에 평문으로 노출되지 않도록 `OMNI_SECRET_KEY`를 키로 활용해 AES-GCM 대칭 키 알고리즘으로 암호화하여 저장하며, UI 조회 시에는 마스킹 처리하여 역노출을 방지함.
- **타입별 정적 스키마 테이블**: 단일 JSON 필드 저장 형식을 지양하고 VM, K8s, Gitlab 등 개별 도메인 구조에 맞는 스키마를 구성하여 강력한 DB 스키마 검증 및 데이터 무결성을 보장함.
- **저장과 검증의 디커플링 (Decoupling)**: 외부 인프라의 일시적 장애가 설정 저장을 막지 않도록, CRUD 동작(저장)과 API 연결 검증(Test Connection)을 분리 설계함. 연결 테스트 실패 시에는 에러 상세(`upstreamStatus` 등)를 클라이언트에 명시적으로 전달함.
- **동적 다중 연동 지원**: 다중 Kubernetes 클러스터 및 연동 도구(GitLab, ArgoCD 등)를 원활하게 등록할 수 있도록 snapshot 응답 포맷을 설계함. 연동 실패 상세는 에러 봉투(envelope)에 담고, snapshot은 부분 실패 시 `207 Multi-Status`, 전체 runtime source 실패 시 `502 Bad Gateway`로 반환함.
- **인라인 수정 폼 UX**: 기존에 상단 생성 폼을 덮어쓰던 수정 방식을 개선하여, 개별 연동 도구 항목 아래에 독립된 인라인 수정 폼이 나타나도록 하여 더욱 직관적인 설정을 가능하게 함.
- **리소스별 개별 갱신 (Granular API Reloading)**: 특정 툴의 저장 또는 삭제 작업 시 모든 연동 정보를 일괄 재조회하지 않고, 변경된 리소스 전용 로딩 로직만 호출하여 클라이언트 성능 및 API 트래픽을 최적화함.
- **Admin 전용 접근 제어**: `viewer` 권한 계정은 접근할 수 없도록, Manage API 및 웹 페이지 진입 경로에 `admin` 역할 검증 미들웨어를 두어 보호함.
