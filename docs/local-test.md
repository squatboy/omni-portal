# 로컬 테스트 가이드

이 문서는 로컬 환경에서 서비스를 직접 빌드하고 컨테이너를 실행하여 테스트하는 방법을 설명합니다.

## 1. 이미지 빌드

먼저 백엔드와 프론트엔드 이미지를 `local` 태그로 빌드합니다.

```bash
# 백엔드 빌드
docker build -t ghcr.io/squatboy/omni-backend:local ./backend

# 프론트엔드 빌드
docker build -t ghcr.io/squatboy/omni-frontend:local ./frontend
```

## 2. 환경 설정 (.env.local)

`deploy` 디렉토리에 `.env.local` 파일을 생성하고 필요한 설정값을 입력합니다.

```bash
cp deploy/.env.example deploy/.env.local
```

`deploy/.env.local` 수정 예시:
```env
OMNI_VERSION=local
POSTGRES_DB=omni
POSTGRES_USER=omni
POSTGRES_PASSWORD=local-password
OMNI_SECRET_KEY=0123456789abcdef0123456789abcdef
```

## 3. 필수 리소스 준비

`docker-compose.yml`에서 참조하는 인증서 파일을 준비해야 합니다.

```bash
# 인증서 파일 생성 (없을 경우 빈 파일이라도 생성하여 마운트 에러 방지)
mkdir -p deploy/certs
touch deploy/certs/kubernetes-ca.crt
```

VM, Kubernetes, GitLab, ArgoCD, Nexus 설정은 더 이상 `inventory.json`으로 준비하지 않습니다.
컨테이너 실행 후 `http://localhost:3000`에서 최초 admin을 만들고 `Manage` 화면에서 등록합니다.

## 4. 컨테이너 실행

`deploy` 디렉토리에서 `.env.local` 파일을 지정하여 실행합니다.

```bash
cd deploy
docker-compose --env-file .env.local up -d
```

## 5. 접속 확인

브라우저에서 다음 주소로 접속합니다.

- **Frontend**: [http://localhost:3000](http://localhost:3000)
- **Backend ready**: Compose 내부에서는 `http://backend:8080/health/ready`, 로컬 직접 실행 시 `http://localhost:8080/health/ready`

최초 접속 흐름:

1. DB에 사용자가 없는 상태에서 admin 계정 생성
2. 생성한 계정으로 로그인
3. `Manage > Resources`에서 VM 등록
4. `Manage > Integrations`에서 외부 시스템 credential 등록
5. 각 integration의 `Test connection` 실행

## 6. 종료 및 정리

```bash
docker-compose down
```
