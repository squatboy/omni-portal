# Resource Collection Logic

This document describes the logic used by the Omni dashboard (implemented in the Go backend) to collect status information for each resource.

### Implementation Overview
- **Language**: Go
- **Framework**: Gin (API), Native Go goroutines & channels (Collector)
- **Concurrency**: Goroutines를 사용하여 각 resource를 병렬로 수집하며, `sync.RWMutex` 기반의 in-memory 캐시에 snapshot을 저장함
- **Interval**: 30초 주기로 백그라운드에서 모든 resource 상태를 갱신함

### Kubernetes
- collector는 매 수집 시 PostgreSQL의 active resource/integration 설정을 읽음
- Kubernetes API를 통해 Nodes, Manage에서 등록한 namespace 범위의 Workloads, Pods, Services, Ingresses, PVCs 정보를 조회함
- `/apis/metrics.k8s.io/v1beta1/nodes` 엔드포인트를 호출하여 각 노드의 CPU 및 메모리 실제 사용량(Usage) 메트릭을 수집함
- 수집된 사용량 데이터를 노드의 `allocatable` 자원량과 비교하여 백분율(%)로 계산하여 표시함
- metrics API가 없거나 metrics 권한만 부족한 경우 Kubernetes source 전체 실패로 보지 않고 노드 사용량만 비워 둠
- Omni 백엔드는 Kubernetes cluster 외부 VM에서 실행되며, Manage에 등록된 API URL, bearer token, 전용 CA 인증서를 사용하여 HTTPS로 접속함
- 여러 Kubernetes integration이 있으면 같은 collect envelope에 integration 이름을 포함해 병합함
- Kubernetes source 장애는 `down`/`timeout`/`stale`로 격리하며, 장애 중 Kubernetes 세부 수집 지속 보장은 v1 범위 밖임

### Pods
- namespace별 `/api/v1/namespaces/{namespace}/pods` 엔드포인트를 호출하여 개별 Pod의 상세 상태 데이터를 가져옴
- `status.conditions` 배열에서 `Ready` 타입의 상태값이 `true`인지를 체크하여 실제 서비스 가능 여부를 판단함
- `status.containerStatuses`에 기록된 `restartCount`를 합산하여 컨테이너의 비정상 종료 및 재시작 횟수를 수집함
- **워크로드 연결**: ReplicaSet의 `ownerReferences`를 추적하여 특정 Pod의 재시작 횟수를 상위 Deployment 또는 StatefulSet 단위로 합산하여 표시함
- **기타 리소스**: Ingress의 호스트 목록을 추출하고, PVC의 상태가 `Bound`인지 `Pending`인지 구분하여 전체 카운트를 수집함

### VMs (Virtual Machines)
- Go의 `os/exec` 패키지를 사용하여 OS 레벨의 `ping` 명령어를 실행함
- 각 VM의 IP 주소 또는 호스트네임에 대해 `ping -c 1` (Linux/Darwin) 또는 `ping -n 1` (Windows)을 실행하여 네트워크 연결성을 확인함
- 명령어 실행 결과가 성공이면 `up`, 실패하면 `down`, 타임아웃 발생 시 `unknown`으로 상태를 정의함
- Docker Compose 실행 기준으로 ICMP ping을 위해 백엔드 컨테이너에 `NET_RAW` capability가 필요함

### ArgoCD
- ArgoCD API의 `/api/v1/applications` 엔드포인트를 호출하여 관리 중인 모든 애플리케이션 정보를 가져옴
- 애플리케이션의 `sync.status`(동기화 상태)와 `health.status`(헬스 체크 상태)를 수집하여 표시함
- 인증을 위해 Manage에 등록된 Bearer token을 복호화해 사용함
- 여러 ArgoCD integration이 있으면 application 항목에 integration 이름을 포함함

### GitLab
- GitLab API를 사용하여 설정된 프로젝트의 최신 커밋(Commit) 정보와 파이프라인(Pipeline) 상태를 조회함
- 각 프로젝트별로 `/repository/commits` 및 `/pipelines` 엔드포인트를 호출하여 개별 프로젝트의 건강 상태를 판단함
- `baseUrl`, token, project 설정이 없거나 GitLab API 인증/응답/파싱이 실패하면 test connection과 collector source 상태를 실패로 처리함
- Manage에 등록된 token을 복호화해 API 권한을 획득함
- 여러 GitLab integration이 있으면 project 항목에 integration 이름을 포함함

### Nexus
- Nexus Repository Manager의 `/service/rest/v1/status` 엔드포인트에 HTTP HEAD 요청을 보냄
- HTTP 응답 코드가 200 OK 등 성공일 경우에만 연결 가능(`reachable`) 상태로 간주함
- 별도의 인증 토큰 없이 공개 헬스체크 API의 응답 여부로 상태를 단순 체크함
- 여러 Nexus integration은 `items` 배열로 표현하고 기존 단일 URL 필드는 첫 항목 요약으로 유지함
