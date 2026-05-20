package collector

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"omni-backend/internal/models"
)

const kubernetesCAPath = "/run/secrets/kubernetes-ca.crt"

type kubernetesList[T any] struct {
	Items []T `json:"items"`
}

type kubernetesOwnerReference struct {
	Kind       string `json:"kind"`
	Name       string `json:"name"`
	Controller *bool  `json:"controller"`
}

type kubernetesCondition struct {
	Type   string `json:"type"`
	Status string `json:"status"`
	Reason string `json:"reason"`
}

type kubernetesNode struct {
	Metadata struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Status struct {
		Allocatable map[string]string     `json:"allocatable"`
		Conditions  []kubernetesCondition `json:"conditions"`
	} `json:"status"`
}

type kubernetesNodeMetric struct {
	Metadata struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Usage map[string]string `json:"usage"`
}

type kubernetesPod struct {
	Metadata struct {
		Name            string                     `json:"name"`
		Namespace       string                     `json:"namespace"`
		OwnerReferences []kubernetesOwnerReference `json:"ownerReferences"`
	} `json:"metadata"`
	Status struct {
		Conditions        []kubernetesCondition `json:"conditions"`
		ContainerStatuses []struct {
			RestartCount int `json:"restartCount"`
		} `json:"containerStatuses"`
	} `json:"status"`
}

type kubernetesReplicaSet struct {
	Metadata struct {
		Name            string                     `json:"name"`
		Namespace       string                     `json:"namespace"`
		OwnerReferences []kubernetesOwnerReference `json:"ownerReferences"`
	} `json:"metadata"`
}

type kubernetesDeployment struct {
	Metadata kubernetesObjectMeta `json:"metadata"`
	Spec     struct {
		Replicas *int `json:"replicas"`
	} `json:"spec"`
	Status struct {
		ReadyReplicas       int                   `json:"readyReplicas"`
		Replicas            int                   `json:"replicas"`
		UpdatedReplicas     int                   `json:"updatedReplicas"`
		AvailableReplicas   int                   `json:"availableReplicas"`
		UnavailableReplicas int                   `json:"unavailableReplicas"`
		Conditions          []kubernetesCondition `json:"conditions"`
	} `json:"status"`
}

type kubernetesStatefulSet struct {
	Metadata kubernetesObjectMeta `json:"metadata"`
	Spec     struct {
		Replicas *int `json:"replicas"`
	} `json:"spec"`
	Status struct {
		ReadyReplicas       int `json:"readyReplicas"`
		Replicas            int `json:"replicas"`
		UpdatedReplicas     int `json:"updatedReplicas"`
		AvailableReplicas   int `json:"availableReplicas"`
		UnavailableReplicas int `json:"unavailableReplicas"`
	} `json:"status"`
}

type kubernetesDaemonSet struct {
	Metadata kubernetesObjectMeta `json:"metadata"`
	Status   struct {
		CurrentNumberScheduled int `json:"currentNumberScheduled"`
		DesiredNumberScheduled int `json:"desiredNumberScheduled"`
		NumberReady            int `json:"numberReady"`
		UpdatedNumberScheduled int `json:"updatedNumberScheduled"`
		NumberAvailable        int `json:"numberAvailable"`
		NumberUnavailable      int `json:"numberUnavailable"`
	} `json:"status"`
}

type kubernetesObjectMeta struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
}

type kubernetesService struct{}

type kubernetesPersistentVolumeClaim struct {
	Status struct {
		Phase string `json:"phase"`
	} `json:"status"`
}

type kubernetesIngress struct {
	Spec struct {
		Rules []struct {
			Host string `json:"host"`
		} `json:"rules"`
	} `json:"spec"`
}

type kubernetesNodeUsage struct {
	cpuMilli    float64
	memoryBytes float64
}

type kubernetesAPIError struct {
	code   models.CollectErrorCode
	status models.SourceStatus
	err    error
}

func (e *kubernetesAPIError) Error() string {
	return e.err.Error()
}

func CollectKubernetes(ctx context.Context, targets []models.KubernetesCollectTarget) models.CollectEnvelope[models.KubernetesData] {
	now := time.Now().Format(time.RFC3339)
	if len(targets) == 0 {
		collectedAt := now
		return models.CollectEnvelope[models.KubernetesData]{
			Source:      models.SourceKubernetes,
			Status:      models.StatusOk,
			AttemptedAt: now,
			CollectedAt: &collectedAt,
			Stale:       false,
			Data:        emptyKubernetesData(models.KubernetesCollectTarget{ClusterName: "unconfigured"}),
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	merged := emptyKubernetesData(targets[0])
	merged.ClusterName = ""
	status := models.StatusOk
	var collectErr *models.CollectError
	isStale := false

	for _, target := range targets {
		wg.Add(1)
		go func(target models.KubernetesCollectTarget) {
			defer wg.Done()
			result := collectKubernetesTarget(ctx, target, now)
			mu.Lock()
			mergeKubernetesData(&merged, result.Data)
			if severity(result.Status) > severity(status) {
				status = result.Status
				collectErr = result.Error
			}
			if result.Stale {
				isStale = true
			}
			mu.Unlock()
		}(target)
	}
	wg.Wait()
	if merged.ClusterName == "" {
		names := make([]string, 0, len(targets))
		for _, target := range targets {
			names = append(names, target.ClusterName)
		}
		merged.ClusterName = strings.Join(names, ", ")
	}

	collectedAt := now
	return models.CollectEnvelope[models.KubernetesData]{
		Source:      models.SourceKubernetes,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       isStale,
		Error:       collectErr,
		Data:        merged,
	}
}

func collectKubernetesTarget(ctx context.Context, target models.KubernetesCollectTarget, now string) models.CollectEnvelope[models.KubernetesData] {
	data := emptyKubernetesData(target)
	baseURL := strings.TrimRight(target.APIURL, "/")
	if baseURL == "" {
		return kubernetesError(now, data, models.ErrUnknownError, "Kubernetes API URL not configured", models.StatusUnknown)
	}
	if strings.TrimSpace(target.Token) == "" {
		return kubernetesError(now, data, models.ErrPermissionDenied, "Kubernetes bearer token is missing", models.StatusPermissionError)
	}

	client, err := newKubernetesHTTPClient()
	if err != nil {
		return kubernetesError(now, data, models.ErrConnectionFailed, err.Error(), models.StatusDown)
	}

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	nodes, err := fetchKubernetesJSON[kubernetesList[kubernetesNode]](reqCtx, client, baseURL, target.Token, "/api/v1/nodes")
	if err != nil {
		return kubernetesAPIEnvelope(now, data, err)
	}

	metrics := fetchKubernetesNodeMetrics(reqCtx, client, baseURL, target.Token)
	data.Nodes = toNodeStatuses(nodes.Items, metrics)
	for i := range data.Nodes {
		data.Nodes[i].IntegrationName = target.Name
	}

	workloads := make([]models.KubernetesWorkloadStatus, 0)
	podRestartsByWorkload := make(map[string]int)
	isStale := hasNotReadyNode(data.Nodes)

	for _, namespace := range target.Namespaces {
		pods, err := fetchKubernetesJSON[kubernetesList[kubernetesPod]](reqCtx, client, baseURL, target.Token, "/api/v1/namespaces/"+url.PathEscape(namespace)+"/pods")
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		data.Pods.Total += len(pods.Items)
		for _, pod := range pods.Items {
			if podReady(pod) {
				data.Pods.Ready++
			} else {
				data.Pods.NotReady++
				isStale = true
			}

			restarts := podRestartCount(pod)
			if restarts > 0 {
				data.Pods.Restarting++
			}
		}

		replicaSets, err := fetchKubernetesJSON[kubernetesList[kubernetesReplicaSet]](reqCtx, client, baseURL, target.Token, "/apis/apps/v1/namespaces/"+url.PathEscape(namespace)+"/replicasets")
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		podRestartsByWorkload = mergeRestartCounts(podRestartsByWorkload, buildRestartByWorkload(namespace, pods.Items, replicaSets.Items))

		services, err := fetchKubernetesJSON[kubernetesList[kubernetesService]](reqCtx, client, baseURL, target.Token, "/api/v1/namespaces/"+url.PathEscape(namespace)+"/services")
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		data.Services.Total += len(services.Items)

		pvcs, err := fetchKubernetesJSON[kubernetesList[kubernetesPersistentVolumeClaim]](reqCtx, client, baseURL, target.Token, "/api/v1/namespaces/"+url.PathEscape(namespace)+"/persistentvolumeclaims")
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		data.Pvcs.Total += len(pvcs.Items)
		for _, pvc := range pvcs.Items {
			switch pvc.Status.Phase {
			case "Bound":
				data.Pvcs.Bound++
			case "Pending":
				data.Pvcs.Pending++
				isStale = true
			}
		}

		ingresses, err := fetchKubernetesJSON[kubernetesList[kubernetesIngress]](reqCtx, client, baseURL, target.Token, "/apis/networking.k8s.io/v1/namespaces/"+url.PathEscape(namespace)+"/ingresses")
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		data.Ingresses.Total += len(ingresses.Items)
		for _, ingress := range ingresses.Items {
			for _, rule := range ingress.Spec.Rules {
				if rule.Host != "" {
					data.Ingresses.Hosts = append(data.Ingresses.Hosts, rule.Host)
				}
			}
		}

		namespaceWorkloads, namespaceStale, err := fetchKubernetesWorkloads(reqCtx, client, baseURL, target.Token, namespace)
		if err != nil {
			return kubernetesAPIEnvelope(now, data, err)
		}
		workloads = append(workloads, namespaceWorkloads...)
		if namespaceStale {
			isStale = true
		}
	}

	for i := range workloads {
		workloads[i].IntegrationName = target.Name
		workloads[i].RestartCount = podRestartsByWorkload[workloadKey(workloads[i].Namespace, workloads[i].Kind, workloads[i].Name)]
	}

	data.Workloads = workloads
	data.AppWorkloads = filterAppWorkloads(workloads, target.AppNamespaces)

	status := models.StatusOk
	if isStale {
		status = models.StatusStale
	}

	collectedAt := now
	return models.CollectEnvelope[models.KubernetesData]{
		Source:      models.SourceKubernetes,
		Status:      status,
		AttemptedAt: now,
		CollectedAt: &collectedAt,
		Stale:       isStale,
		Error:       nil,
		Data:        data,
	}
}

func emptyKubernetesData(target models.KubernetesCollectTarget) models.KubernetesData {
	clusterName := target.ClusterName
	if clusterName == "" {
		clusterName = "unknown-cluster"
	}

	return models.KubernetesData{
		ClusterName:  clusterName,
		Nodes:        []models.KubernetesNodeStatus{},
		Namespaces:   target.Namespaces,
		Workloads:    []models.KubernetesWorkloadStatus{},
		AppWorkloads: []models.KubernetesWorkloadStatus{},
		Pods:         models.PodsStatus{},
		Services:     models.ServicesStatus{},
		Ingresses: models.IngressesStatus{
			Hosts: []string{},
		},
		Pvcs: models.PvcsStatus{},
	}
}

func mergeKubernetesData(dst *models.KubernetesData, src models.KubernetesData) {
	if dst.ClusterName == "" {
		dst.ClusterName = src.ClusterName
	} else if src.ClusterName != "" {
		dst.ClusterName += ", " + src.ClusterName
	}
	dst.Nodes = append(dst.Nodes, src.Nodes...)
	dst.Namespaces = append(dst.Namespaces, src.Namespaces...)
	dst.Workloads = append(dst.Workloads, src.Workloads...)
	dst.AppWorkloads = append(dst.AppWorkloads, src.AppWorkloads...)
	dst.Pods.Total += src.Pods.Total
	dst.Pods.Ready += src.Pods.Ready
	dst.Pods.NotReady += src.Pods.NotReady
	dst.Pods.Restarting += src.Pods.Restarting
	dst.Services.Total += src.Services.Total
	dst.Ingresses.Total += src.Ingresses.Total
	dst.Ingresses.Hosts = append(dst.Ingresses.Hosts, src.Ingresses.Hosts...)
	dst.Pvcs.Total += src.Pvcs.Total
	dst.Pvcs.Bound += src.Pvcs.Bound
	dst.Pvcs.Pending += src.Pvcs.Pending
}

func newKubernetesHTTPClient() (*http.Client, error) {
	if _, err := os.Stat(kubernetesCAPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &http.Client{}, nil
		}
		return nil, err
	}

	caPEM, err := os.ReadFile(kubernetesCAPath)
	if err != nil {
		return nil, err
	}

	rootCAs, err := x509.SystemCertPool()
	if err != nil || rootCAs == nil {
		rootCAs = x509.NewCertPool()
	}
	if !rootCAs.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("failed to append Kubernetes CA certificate")
	}

	return &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{RootCAs: rootCAs},
		},
	}, nil
}

func fetchKubernetesJSON[T any](ctx context.Context, client *http.Client, baseURL string, token string, path string) (T, error) {
	var out T

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+path, nil)
	if err != nil {
		return out, &kubernetesAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, err: err}
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := client.Do(req)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return out, &kubernetesAPIError{code: models.ErrTimeout, status: models.StatusTimeout, err: fmt.Errorf("Kubernetes API check timed out")}
		}
		return out, &kubernetesAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, err: err}
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			return out, &kubernetesAPIError{code: models.ErrPermissionDenied, status: models.StatusPermissionError, err: fmt.Errorf("Kubernetes API responded with %d", resp.StatusCode)}
		}
		return out, &kubernetesAPIError{code: models.ErrConnectionFailed, status: models.StatusDown, err: fmt.Errorf("Kubernetes API responded with %d", resp.StatusCode)}
	}

	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return out, &kubernetesAPIError{code: models.ErrUnknownError, status: models.StatusDown, err: fmt.Errorf("failed to parse Kubernetes API response")}
	}

	return out, nil
}

func fetchKubernetesNodeMetrics(ctx context.Context, client *http.Client, baseURL string, token string) map[string]kubernetesNodeUsage {
	metricsCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	payload, err := fetchKubernetesJSON[kubernetesList[kubernetesNodeMetric]](metricsCtx, client, baseURL, token, "/apis/metrics.k8s.io/v1beta1/nodes")
	if err != nil {
		return map[string]kubernetesNodeUsage{}
	}

	usageByNode := make(map[string]kubernetesNodeUsage, len(payload.Items))
	for _, item := range payload.Items {
		cpuMilli, cpuOK := parseKubernetesCPUToMilli(item.Usage["cpu"])
		memoryBytes, memoryOK := parseKubernetesMemoryToBytes(item.Usage["memory"])
		if cpuOK || memoryOK {
			usageByNode[item.Metadata.Name] = kubernetesNodeUsage{
				cpuMilli:    cpuMilli,
				memoryBytes: memoryBytes,
			}
		}
	}
	return usageByNode
}

func toNodeStatuses(nodes []kubernetesNode, metrics map[string]kubernetesNodeUsage) []models.KubernetesNodeStatus {
	statuses := make([]models.KubernetesNodeStatus, 0, len(nodes))
	for _, node := range nodes {
		status := models.KubernetesNodeStatus{
			Name:  node.Metadata.Name,
			Ready: nodeReady(node),
		}

		if usage, ok := metrics[node.Metadata.Name]; ok {
			if allocatableCPU, ok := parseKubernetesCPUToMilli(node.Status.Allocatable["cpu"]); ok && allocatableCPU > 0 && usage.cpuMilli > 0 {
				status.CpuUsagePercent = floatPtr(roundPercent(usage.cpuMilli / allocatableCPU * 100))
			}
			if allocatableMemory, ok := parseKubernetesMemoryToBytes(node.Status.Allocatable["memory"]); ok && allocatableMemory > 0 && usage.memoryBytes > 0 {
				status.MemoryUsagePercent = floatPtr(roundPercent(usage.memoryBytes / allocatableMemory * 100))
			}
		}

		statuses = append(statuses, status)
	}
	return statuses
}

func fetchKubernetesWorkloads(ctx context.Context, client *http.Client, baseURL string, token string, namespace string) ([]models.KubernetesWorkloadStatus, bool, error) {
	workloads := []models.KubernetesWorkloadStatus{}
	isStale := false

	deployments, err := fetchKubernetesJSON[kubernetesList[kubernetesDeployment]](ctx, client, baseURL, token, "/apis/apps/v1/namespaces/"+url.PathEscape(namespace)+"/deployments")
	if err != nil {
		return nil, false, err
	}
	for _, deployment := range deployments.Items {
		workload := toDeploymentWorkload(deployment, namespace)
		workloads = append(workloads, workload)
		if workloadIsStale(workload) {
			isStale = true
		}
	}

	statefulSets, err := fetchKubernetesJSON[kubernetesList[kubernetesStatefulSet]](ctx, client, baseURL, token, "/apis/apps/v1/namespaces/"+url.PathEscape(namespace)+"/statefulsets")
	if err != nil {
		return nil, false, err
	}
	for _, statefulSet := range statefulSets.Items {
		workload := toStatefulSetWorkload(statefulSet, namespace)
		workloads = append(workloads, workload)
		if workloadIsStale(workload) {
			isStale = true
		}
	}

	daemonSets, err := fetchKubernetesJSON[kubernetesList[kubernetesDaemonSet]](ctx, client, baseURL, token, "/apis/apps/v1/namespaces/"+url.PathEscape(namespace)+"/daemonsets")
	if err != nil {
		return nil, false, err
	}
	for _, daemonSet := range daemonSets.Items {
		workload := toDaemonSetWorkload(daemonSet, namespace)
		workloads = append(workloads, workload)
		if workloadIsStale(workload) {
			isStale = true
		}
	}

	return workloads, isStale, nil
}

func toDeploymentWorkload(deployment kubernetesDeployment, namespace string) models.KubernetesWorkloadStatus {
	desired := intValue(deployment.Spec.Replicas, 1)
	workload := models.KubernetesWorkloadStatus{
		Namespace:           namespaceOrFallback(deployment.Metadata.Namespace, namespace),
		Kind:                "deployment",
		Name:                deployment.Metadata.Name,
		ReadyReplicas:       deployment.Status.ReadyReplicas,
		DesiredReplicas:     desired,
		Replicas:            deployment.Status.Replicas,
		UpdatedReplicas:     deployment.Status.UpdatedReplicas,
		AvailableReplicas:   deployment.Status.AvailableReplicas,
		UnavailableReplicas: deployment.Status.UnavailableReplicas,
		Progressing:         deploymentProgressing(deployment.Status.Conditions),
	}
	return workload
}

func toStatefulSetWorkload(statefulSet kubernetesStatefulSet, namespace string) models.KubernetesWorkloadStatus {
	desired := intValue(statefulSet.Spec.Replicas, 1)
	return models.KubernetesWorkloadStatus{
		Namespace:           namespaceOrFallback(statefulSet.Metadata.Namespace, namespace),
		Kind:                "statefulset",
		Name:                statefulSet.Metadata.Name,
		ReadyReplicas:       statefulSet.Status.ReadyReplicas,
		DesiredReplicas:     desired,
		Replicas:            statefulSet.Status.Replicas,
		UpdatedReplicas:     statefulSet.Status.UpdatedReplicas,
		AvailableReplicas:   statefulSet.Status.AvailableReplicas,
		UnavailableReplicas: statefulSet.Status.UnavailableReplicas,
		Progressing:         statefulSet.Status.ReadyReplicas != desired || statefulSet.Status.UpdatedReplicas != desired,
	}
}

func toDaemonSetWorkload(daemonSet kubernetesDaemonSet, namespace string) models.KubernetesWorkloadStatus {
	desired := daemonSet.Status.DesiredNumberScheduled
	return models.KubernetesWorkloadStatus{
		Namespace:           namespaceOrFallback(daemonSet.Metadata.Namespace, namespace),
		Kind:                "daemonset",
		Name:                daemonSet.Metadata.Name,
		ReadyReplicas:       daemonSet.Status.NumberReady,
		DesiredReplicas:     desired,
		Replicas:            daemonSet.Status.CurrentNumberScheduled,
		UpdatedReplicas:     daemonSet.Status.UpdatedNumberScheduled,
		AvailableReplicas:   daemonSet.Status.NumberAvailable,
		UnavailableReplicas: daemonSet.Status.NumberUnavailable,
		Progressing:         daemonSet.Status.NumberReady != desired || daemonSet.Status.UpdatedNumberScheduled != desired,
	}
}

func buildRestartByWorkload(namespace string, pods []kubernetesPod, replicaSets []kubernetesReplicaSet) map[string]int {
	replicaSetOwners := make(map[string]string, len(replicaSets))
	for _, rs := range replicaSets {
		if owner, ok := controllerOwner(rs.Metadata.OwnerReferences); ok && owner.Kind == "Deployment" {
			replicaSetOwners[rs.Metadata.Name] = owner.Name
		}
	}

	restartsByWorkload := make(map[string]int)
	for _, pod := range pods {
		owner, ok := controllerOwner(pod.Metadata.OwnerReferences)
		if !ok {
			continue
		}

		podNamespace := namespaceOrFallback(pod.Metadata.Namespace, namespace)
		switch owner.Kind {
		case "ReplicaSet":
			deploymentName, ok := replicaSetOwners[owner.Name]
			if !ok {
				continue
			}
			restartsByWorkload[workloadKey(podNamespace, "deployment", deploymentName)] += podRestartCount(pod)
		case "StatefulSet":
			restartsByWorkload[workloadKey(podNamespace, "statefulset", owner.Name)] += podRestartCount(pod)
		case "DaemonSet":
			restartsByWorkload[workloadKey(podNamespace, "daemonset", owner.Name)] += podRestartCount(pod)
		}
	}
	return restartsByWorkload
}

func mergeRestartCounts(left map[string]int, right map[string]int) map[string]int {
	for key, value := range right {
		left[key] += value
	}
	return left
}

func controllerOwner(owners []kubernetesOwnerReference) (kubernetesOwnerReference, bool) {
	for _, owner := range owners {
		if owner.Controller != nil && !*owner.Controller {
			continue
		}
		if owner.Kind != "" && owner.Name != "" {
			return owner, true
		}
	}
	return kubernetesOwnerReference{}, false
}

func filterAppWorkloads(workloads []models.KubernetesWorkloadStatus, appNamespaces []string) []models.KubernetesWorkloadStatus {
	if len(appNamespaces) == 0 {
		return []models.KubernetesWorkloadStatus{}
	}

	namespaceSet := make(map[string]struct{}, len(appNamespaces))
	for _, namespace := range appNamespaces {
		namespaceSet[namespace] = struct{}{}
	}

	appWorkloads := make([]models.KubernetesWorkloadStatus, 0)
	for _, workload := range workloads {
		if _, ok := namespaceSet[workload.Namespace]; ok {
			appWorkloads = append(appWorkloads, workload)
		}
	}
	return appWorkloads
}

func kubernetesAPIEnvelope(now string, data models.KubernetesData, err error) models.CollectEnvelope[models.KubernetesData] {
	var apiErr *kubernetesAPIError
	if errors.As(err, &apiErr) {
		return kubernetesError(now, data, apiErr.code, apiErr.err.Error(), apiErr.status)
	}
	return kubernetesError(now, data, models.ErrUnknownError, err.Error(), models.StatusDown)
}

func kubernetesError(now string, data models.KubernetesData, code models.CollectErrorCode, msg string, status models.SourceStatus) models.CollectEnvelope[models.KubernetesData] {
	return models.CollectEnvelope[models.KubernetesData]{
		Source:      models.SourceKubernetes,
		Status:      status,
		AttemptedAt: now,
		Stale:       false,
		Error:       &models.CollectError{Code: code, Message: msg},
		Data:        data,
	}
}

func nodeReady(node kubernetesNode) bool {
	for _, condition := range node.Status.Conditions {
		if condition.Type == "Ready" {
			return condition.Status == "True"
		}
	}
	return false
}

func podReady(pod kubernetesPod) bool {
	for _, condition := range pod.Status.Conditions {
		if condition.Type == "Ready" {
			return condition.Status == "True"
		}
	}
	return false
}

func podRestartCount(pod kubernetesPod) int {
	total := 0
	for _, status := range pod.Status.ContainerStatuses {
		total += status.RestartCount
	}
	return total
}

func hasNotReadyNode(nodes []models.KubernetesNodeStatus) bool {
	for _, node := range nodes {
		if !node.Ready {
			return true
		}
	}
	return false
}

func workloadIsStale(workload models.KubernetesWorkloadStatus) bool {
	return workload.ReadyReplicas != workload.DesiredReplicas ||
		workload.UpdatedReplicas != workload.DesiredReplicas ||
		workload.AvailableReplicas != workload.DesiredReplicas ||
		workload.UnavailableReplicas > 0
}

func deploymentProgressing(conditions []kubernetesCondition) bool {
	for _, condition := range conditions {
		if condition.Type == "Progressing" && condition.Status == "True" && condition.Reason != "NewReplicaSetAvailable" {
			return true
		}
	}
	return false
}

func workloadKey(namespace string, kind string, name string) string {
	return namespace + "/" + kind + "/" + name
}

func namespaceOrFallback(value string, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func intValue(value *int, fallback int) int {
	if value == nil {
		return fallback
	}
	return *value
}

func floatPtr(value float64) *float64 {
	return &value
}

func roundPercent(value float64) float64 {
	return math.Round(value*100) / 100
}

func parseKubernetesCPUToMilli(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}

	unitMultipliers := map[string]float64{
		"n": 0.000001,
		"u": 0.001,
		"m": 1,
	}
	for suffix, multiplier := range unitMultipliers {
		if strings.HasSuffix(value, suffix) {
			parsed, err := strconv.ParseFloat(strings.TrimSuffix(value, suffix), 64)
			return parsed * multiplier, err == nil
		}
	}

	parsed, err := strconv.ParseFloat(value, 64)
	return parsed * 1000, err == nil
}

func parseKubernetesMemoryToBytes(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}

	binaryUnits := map[string]float64{
		"Ki": 1024,
		"Mi": 1024 * 1024,
		"Gi": 1024 * 1024 * 1024,
		"Ti": 1024 * 1024 * 1024 * 1024,
		"Pi": 1024 * 1024 * 1024 * 1024 * 1024,
		"Ei": 1024 * 1024 * 1024 * 1024 * 1024 * 1024,
	}
	for suffix, multiplier := range binaryUnits {
		if strings.HasSuffix(value, suffix) {
			parsed, err := strconv.ParseFloat(strings.TrimSuffix(value, suffix), 64)
			return parsed * multiplier, err == nil
		}
	}

	decimalUnits := map[string]float64{
		"K": 1_000,
		"M": 1_000_000,
		"G": 1_000_000_000,
		"T": 1_000_000_000_000,
		"P": 1_000_000_000_000_000,
		"E": 1_000_000_000_000_000_000,
	}
	for suffix, multiplier := range decimalUnits {
		if strings.HasSuffix(value, suffix) {
			parsed, err := strconv.ParseFloat(strings.TrimSuffix(value, suffix), 64)
			return parsed * multiplier, err == nil
		}
	}

	parsed, err := strconv.ParseFloat(value, 64)
	return parsed, err == nil
}
