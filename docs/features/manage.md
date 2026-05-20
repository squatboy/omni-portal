# Manage CRUD

Manage는 self-hosted 사용자가 UI에서 자신의 인프라 리소스와 외부 도구 연동 정보를 관리하는 영역이다.
기존 파일 기반 `inventory.json`은 runtime source of truth에서 제거하고 PostgreSQL을 기준으로 한다.

## Scope
- Sidebar에는 클릭 가능한 단일 `Manage` 버튼을 두지 않고, `Manage` 그룹 라벨 아래에 하위 메뉴를 둔다.
- 하위 메뉴는 `Resources`, `Integrations`, `Users`로 나눈다.
- Manage 화면 내부에는 별도 tablist를 두지 않고, sidebar에서 선택한 section만 렌더링한다.
- `Resources`는 VM 같은 관측 대상 리소스를 관리한다.
- `Integrations`는 Kubernetes, GitLab, ArgoCD, Nexus 연결 정보를 관리한다.
- `Users`는 admin이 계정과 권한을 관리하는 영역이다.
- IPAM 기능은 이번 범위에서 제외하되, PostgreSQL 선택은 향후 IPAM 확장을 고려한 결정이다.

## Data Source Principle
- PostgreSQL이 설정 데이터의 단일 source of truth다.
- `deploy/config/inventory.json`과 `inventory.example.json`은 runtime 기준에서 제거한다.
- 기존 inventory 파일 fallback은 제공하지 않는다.
- collector는 30초 수집 주기마다 DB의 active 설정을 읽어 상태를 수집한다.
- `/api/collect/snapshot`은 다중 integration을 표현하도록 breaking change를 허용한다.

## CRUD Model
- 범용 JSON resource 테이블이 아니라 타입별 테이블을 사용한다.
- VM, Kubernetes, GitLab, ArgoCD, Nexus는 각 도메인에 맞는 필드와 검증 규칙을 가진다.
- 여러 Kubernetes cluster와 여러 tool instance 등록을 허용한다.
- UI에서 active 여부를 조정할 수 있고, 삭제 API는 레코드를 제거한다.
- 각 레코드는 `created_at`, `updated_at`, `created_by`, `updated_by` 수준의 변경 메타데이터를 가진다.
- 별도 audit log는 이번 범위에서 제외한다.

## Credential Principle
- Kubernetes bearer token, GitLab token, ArgoCD token 같은 외부 접근 credential도 UI에서 관리한다.
- DB에는 credential 평문을 저장하지 않는다.
- 서버는 `OMNI_SECRET_KEY`를 사용해 AES-GCM 방식으로 credential을 암호화 저장한다.
- 수정 화면에서는 기존 secret 값을 다시 보여주지 않는다.
- UI는 `Configured` 상태와 교체 입력만 제공한다.
- 새 값을 입력하면 기존 secret을 교체한다.

## Validation Flow
- 저장과 연결 검증은 분리한다.
- 사용자는 네트워크가 일시적으로 막혀 있어도 설정을 저장할 수 있다.
- 각 integration에는 `Test connection` 액션을 둔다.
- 테스트 결과는 collector 상태와 별도로 마지막 검증 결과로 표시한다.
- 실제 dashboard health는 collector가 수집한 snapshot을 기준으로 판단한다.

## Access Rules
- `admin`만 Manage 화면과 CRUD API에 접근할 수 있다.
- `viewer`는 dashboard 조회만 가능하다.
- 모든 Manage API는 로그인 세션을 요구한다.
