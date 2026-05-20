# Login / Auth

Omni는 self-hosted 단일 조직 인스턴스를 전제로 기본 ID/PW 로그인을 제공한다.
목표는 공개 가입이 아니라, 인프라 대시보드와 Manage 기능을 최소 권한으로 보호하는 것이다.

## User Model
- 한 Omni 인스턴스는 하나의 조직/환경을 관리한다.
- 계정은 여러 개 만들 수 있지만, 리소스/툴 설정은 조직 단위로 공유한다.
- 권한은 `admin`과 `viewer` 두 단계만 둔다.
- `admin`은 Manage CRUD와 사용자 관리를 수행한다.
- `viewer`는 dashboard 조회만 가능하다.

## First Setup Flow
- DB에 사용자가 없을 때만 최초 설정 화면을 연다.
- 최초 admin 생성은 DB에 사용자가 없을 때만 허용한다.
- 첫 admin 생성 후 공개 회원가입은 닫힌다.
- 이후 사용자는 admin이 직접 생성한다.

## Password Flow
- 비밀번호는 DB에 평문으로 저장하지 않는다.
- 서버는 비밀번호를 bcrypt 기반 단방향 해시로 저장한다.
- admin이 새 사용자를 만들 때 임시 비밀번호를 발급한다.
- 새 사용자는 첫 로그인 후 비밀번호 변경을 강제받는다.
- 비밀번호 변경은 현재 비밀번호 확인 후 새 해시로 교체한다.

## Session Flow
- JWT가 아니라 opaque session token 방식을 사용한다.
- 로그인 성공 시 서버가 충분히 긴 random session token을 발급한다.
- 브라우저에는 `HttpOnly`, `SameSite=Lax` 쿠키로 전달한다.
- DB에는 session token 원문이 아니라 해시와 만료 시각만 저장한다.
- 로그아웃은 해당 session을 revoke 처리한다.
- 세션 만료 또는 revoke 후에는 모든 보호 API 접근을 거부한다.

## Security Defaults
- 로그인 실패 횟수 제한을 둬 brute-force를 완화한다.
- 인증 실패 사유는 사용자 존재 여부가 드러나지 않게 동일하게 응답한다.
- dashboard 조회는 로그인한 사용자에게만 허용한다.
- Manage API는 `admin`만 허용한다.
- MFA, SSO, 세부 RBAC는 이번 범위에서 제외한다.
