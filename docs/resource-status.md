# Resource Status Determination

Omni 대시보드는 각 리소스 소스로부터 수집된 데이터를 바탕으로 시스템의 건강 상태를 판별합니다. 모든 판별 로직은 Go 백엔드의 각 Collector에서 수행됩니다.

---

### 1. Overview Status (Rollup)
전체 대시보드 상단의 롤업 상태는 모든 소스의 상태(`CollectEnvelope.Status`)를 종합하여 결정됩니다.

* **OK**: 모든 소스의 수집 상태가 `ok`일 때.
* **STALE**: 하나 이상의 소스가 `stale`, `timeout`, 또는 `permission_error` 상태일 때.
* **DOWN**: 모든 소스가 `down` 상태이거나, 주요 소스(Kubernetes 등)가 `down`일 때.

---

### 2. Argo CD
ArgoCD는 개별 애플리케이션의 동기화 및 헬스 상태를 추적합니다.

* **상태 종류**:
    1. Sync Status: `Synced`, `OutOfSync`, `Unknown`
    2. Health Status: `Healthy`, `Progressing`, `Degraded`, `Unknown`
* **판별 기준**:
    * 하나라도 `OutOfSync`이거나 `Degraded`, `Unknown` 상태인 앱이 있으면 해당 소스의 상태는 `stale`로 표시됩니다.

---

### 3. Kubernetes
클러스터의 노드, 워크로드, Pod 상태를 종합적으로 보여줍니다.

* **상태 종류**:
    1. Nodes: `Ready` (True/False)
    2. Workloads: `Ready Replicas` / `Desired Replicas`
    3. Pods: `Ready`, `Not Ready`, `Restarting`
* **판별 기준**:
    * **Node Ready**: Kubernetes 노드 조건 중 `Ready` 가 `True` 인지 확인합니다.
    * **Restarting Pod**: Pod 내 컨테이너의 `restartCount`가 0보다 크면 카운트됩니다.
* **소스 상태 (Source Status)**:
    * `Not Ready Pod > 0` 또는 `Pending PVC > 0` 이면 `stale`로 표시됩니다.

---

### 4. VM (Virtual Machines)
인벤토리에 등록된 각 서버의 가용성을 ICMP Ping으로 체크합니다.

* **상태 종류**: `up`, `down`, `unknown`
* **판별 기준**:
    * **up**: ICMP Ping 응답이 성공했을 때.
    * **down**: Ping 응답이 실패했을 때.
    * **unknown**: 타임아웃 또는 실행 오류 발생 시.
* **소스 상태 (Source Status)**:
    * 모든 VM이 `up`이면 `ok`.
    * 일부만 `up`이면 `stale`.
    * 모두 `down`이면 `down`.

---

### 5. GitLab
등록된 프로젝트의 최신 파이프라인 상태를 모니터링합니다.

* **상태 종류**: `success`, `failed`, `running`, `pending`, `canceled`
* **판별 기준**: GitLab API가 반환하는 최신 파이프라인의 `status` 값을 매핑합니다.
* **소스 상태 (Source Status)**:
    * 하나라도 `failed` 또는 `canceled` 상태의 파이프라인이 있으면 `stale`로 표시됩니다.

---

### 6. Nexus
Artifact 저장소의 HTTP 접근성을 확인합니다.

* **상태 종류**: `reachable` (True/False)
* **판별 기준**: Nexus API (`/service/rest/v1/status`)에 대해 `HEAD` 요청을 보내서 2xx 응답이 오는지 확인합니다.
* **소스 상태 (Source Status)**:
    * `reachable` 하면 `ok`, 아니면 `down`.
