package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestCollectKubernetesSuccess(t *testing.T) {
	server := httptest.NewServer(kubernetesTestHandler(map[string]any{
		"/api/v1/nodes": kubernetesTestList([]any{
			kubernetesTestNode("node-1", true, "2000m", "4Gi"),
		}),
		"/apis/metrics.k8s.io/v1beta1/nodes": kubernetesTestList([]any{
			map[string]any{
				"metadata": map[string]any{"name": "node-1"},
				"usage":    map[string]any{"cpu": "500m", "memory": "1Gi"},
			},
		}),
		"/api/v1/namespaces/apps/pods": kubernetesTestList([]any{
			kubernetesTestPod("apps", "api-abc", true, 2, "ReplicaSet", "api-abc", true),
			kubernetesTestPod("apps", "worker-0", true, 0, "StatefulSet", "worker", true),
		}),
		"/apis/apps/v1/namespaces/apps/replicasets": kubernetesTestList([]any{
			kubernetesTestReplicaSet("apps", "api-abc", "api"),
		}),
		"/api/v1/namespaces/apps/services": kubernetesTestList([]any{
			map[string]any{"metadata": map[string]any{"name": "api"}},
			map[string]any{"metadata": map[string]any{"name": "worker"}},
		}),
		"/api/v1/namespaces/apps/persistentvolumeclaims": kubernetesTestList([]any{
			map[string]any{"status": map[string]any{"phase": "Bound"}},
		}),
		"/apis/networking.k8s.io/v1/namespaces/apps/ingresses": kubernetesTestList([]any{
			map[string]any{"spec": map[string]any{"rules": []any{map[string]any{"host": "app.example.internal"}}}},
		}),
		"/apis/apps/v1/namespaces/apps/deployments": kubernetesTestList([]any{
			kubernetesTestDeployment("apps", "api", 2, 2, 2, 2, 2, 0, "NewReplicaSetAvailable"),
		}),
		"/apis/apps/v1/namespaces/apps/statefulsets": kubernetesTestList([]any{
			kubernetesTestStatefulSet("apps", "worker", 1, 1, 1, 1, 1, 0),
		}),
		"/apis/apps/v1/namespaces/apps/daemonsets": kubernetesTestList([]any{}),
	}))
	defer server.Close()

	t.Setenv("KUBERNETES_API_URL", server.URL)
	t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

	envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, []string{"apps"}))

	if envelope.Status != models.StatusOk {
		t.Fatalf("expected ok status, got %s: %#v", envelope.Status, envelope.Error)
	}
	if envelope.Stale {
		t.Fatalf("expected non-stale envelope")
	}
	if len(envelope.Data.Nodes) != 1 {
		t.Fatalf("expected one node, got %d", len(envelope.Data.Nodes))
	}
	if envelope.Data.Nodes[0].CpuUsagePercent == nil || *envelope.Data.Nodes[0].CpuUsagePercent != 25 {
		t.Fatalf("expected 25%% CPU usage, got %#v", envelope.Data.Nodes[0].CpuUsagePercent)
	}
	if envelope.Data.Nodes[0].MemoryUsagePercent == nil || *envelope.Data.Nodes[0].MemoryUsagePercent != 25 {
		t.Fatalf("expected 25%% memory usage, got %#v", envelope.Data.Nodes[0].MemoryUsagePercent)
	}
	if envelope.Data.Pods.Total != 2 || envelope.Data.Pods.Ready != 2 || envelope.Data.Pods.NotReady != 0 || envelope.Data.Pods.Restarting != 1 {
		t.Fatalf("unexpected pod counts: %#v", envelope.Data.Pods)
	}
	if envelope.Data.Services.Total != 2 {
		t.Fatalf("expected 2 services, got %d", envelope.Data.Services.Total)
	}
	if envelope.Data.Ingresses.Total != 1 || len(envelope.Data.Ingresses.Hosts) != 1 || envelope.Data.Ingresses.Hosts[0] != "app.example.internal" {
		t.Fatalf("unexpected ingress data: %#v", envelope.Data.Ingresses)
	}
	if envelope.Data.Pvcs.Total != 1 || envelope.Data.Pvcs.Bound != 1 || envelope.Data.Pvcs.Pending != 0 {
		t.Fatalf("unexpected pvc data: %#v", envelope.Data.Pvcs)
	}
	if len(envelope.Data.Workloads) != 2 {
		t.Fatalf("expected 2 workloads, got %d", len(envelope.Data.Workloads))
	}
	if envelope.Data.Workloads[0].Name != "api" || envelope.Data.Workloads[0].RestartCount != 2 {
		t.Fatalf("expected deployment restart count to be mapped through ReplicaSet, got %#v", envelope.Data.Workloads[0])
	}
	if len(envelope.Data.AppWorkloads) != 2 {
		t.Fatalf("expected app workloads to include app namespace workloads, got %d", len(envelope.Data.AppWorkloads))
	}
}

func TestCollectKubernetesStaleResources(t *testing.T) {
	server := httptest.NewServer(kubernetesTestHandler(map[string]any{
		"/api/v1/nodes": kubernetesTestList([]any{
			kubernetesTestNode("node-1", true, "2", "4Gi"),
		}),
		"/apis/metrics.k8s.io/v1beta1/nodes": kubernetesTestList([]any{}),
		"/api/v1/namespaces/apps/pods": kubernetesTestList([]any{
			kubernetesTestPod("apps", "api-abc", false, 0, "ReplicaSet", "api-abc", true),
		}),
		"/apis/apps/v1/namespaces/apps/replicasets": kubernetesTestList([]any{
			kubernetesTestReplicaSet("apps", "api-abc", "api"),
		}),
		"/api/v1/namespaces/apps/services": kubernetesTestList([]any{}),
		"/api/v1/namespaces/apps/persistentvolumeclaims": kubernetesTestList([]any{
			map[string]any{"status": map[string]any{"phase": "Pending"}},
		}),
		"/apis/networking.k8s.io/v1/namespaces/apps/ingresses": kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/deployments": kubernetesTestList([]any{
			kubernetesTestDeployment("apps", "api", 3, 1, 2, 2, 1, 2, "ReplicaSetUpdated"),
		}),
		"/apis/apps/v1/namespaces/apps/statefulsets": kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/daemonsets":   kubernetesTestList([]any{}),
	}))
	defer server.Close()

	t.Setenv("KUBERNETES_API_URL", server.URL)
	t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

	envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, []string{"apps"}))

	if envelope.Status != models.StatusStale || !envelope.Stale {
		t.Fatalf("expected stale envelope, got status=%s stale=%t", envelope.Status, envelope.Stale)
	}
	if envelope.Data.Pods.NotReady != 1 {
		t.Fatalf("expected not ready pod count, got %#v", envelope.Data.Pods)
	}
	if envelope.Data.Pvcs.Pending != 1 {
		t.Fatalf("expected pending pvc count, got %#v", envelope.Data.Pvcs)
	}
	if len(envelope.Data.Workloads) != 1 || !envelope.Data.Workloads[0].Progressing {
		t.Fatalf("expected progressing workload, got %#v", envelope.Data.Workloads)
	}
}

func TestCollectKubernetesFailureMapping(t *testing.T) {
	t.Run("missing token", func(t *testing.T) {
		t.Setenv("KUBERNETES_API_URL", "https://kubernetes.example.internal")
		t.Setenv("KUBERNETES_BEARER_TOKEN", "")

		envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, nil))

		if envelope.Status != models.StatusPermissionError || envelope.Error == nil || envelope.Error.Code != models.ErrPermissionDenied {
			t.Fatalf("expected permission error, got status=%s error=%#v", envelope.Status, envelope.Error)
		}
	})

	t.Run("forbidden", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusForbidden)
		}))
		defer server.Close()

		t.Setenv("KUBERNETES_API_URL", server.URL)
		t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

		envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, nil))

		if envelope.Status != models.StatusPermissionError || envelope.Error == nil || envelope.Error.Code != models.ErrPermissionDenied {
			t.Fatalf("expected permission error, got status=%s error=%#v", envelope.Status, envelope.Error)
		}
	})

	t.Run("timeout", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			time.Sleep(50 * time.Millisecond)
		}))
		defer server.Close()

		t.Setenv("KUBERNETES_API_URL", server.URL)
		t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

		ctx, cancel := context.WithTimeout(context.Background(), time.Millisecond)
		defer cancel()

		envelope := CollectKubernetes(ctx, kubernetesTestConfig([]string{"apps"}, nil))

		if envelope.Status != models.StatusTimeout || envelope.Error == nil || envelope.Error.Code != models.ErrTimeout {
			t.Fatalf("expected timeout, got status=%s error=%#v", envelope.Status, envelope.Error)
		}
	})

	t.Run("bad json", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("{"))
		}))
		defer server.Close()

		t.Setenv("KUBERNETES_API_URL", server.URL)
		t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

		envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, nil))

		if envelope.Status != models.StatusDown || envelope.Error == nil || envelope.Error.Code != models.ErrUnknownError {
			t.Fatalf("expected down parse failure, got status=%s error=%#v", envelope.Status, envelope.Error)
		}
	})
}

func TestCollectKubernetesMetricsFailureIsOptional(t *testing.T) {
	server := httptest.NewServer(kubernetesTestHandler(map[string]any{
		"/api/v1/nodes": kubernetesTestList([]any{
			kubernetesTestNode("node-1", true, "2", "4Gi"),
		}),
		"/apis/metrics.k8s.io/v1beta1/nodes":                   http.StatusForbidden,
		"/api/v1/namespaces/apps/pods":                         kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/replicasets":            kubernetesTestList([]any{}),
		"/api/v1/namespaces/apps/services":                     kubernetesTestList([]any{}),
		"/api/v1/namespaces/apps/persistentvolumeclaims":       kubernetesTestList([]any{}),
		"/apis/networking.k8s.io/v1/namespaces/apps/ingresses": kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/deployments":            kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/statefulsets":           kubernetesTestList([]any{}),
		"/apis/apps/v1/namespaces/apps/daemonsets":             kubernetesTestList([]any{}),
	}))
	defer server.Close()

	t.Setenv("KUBERNETES_API_URL", server.URL)
	t.Setenv("KUBERNETES_BEARER_TOKEN", "test-token")

	envelope := CollectKubernetes(context.Background(), kubernetesTestConfig([]string{"apps"}, nil))

	if envelope.Status != models.StatusOk {
		t.Fatalf("expected ok status despite metrics failure, got %s: %#v", envelope.Status, envelope.Error)
	}
	if len(envelope.Data.Nodes) != 1 || envelope.Data.Nodes[0].CpuUsagePercent != nil || envelope.Data.Nodes[0].MemoryUsagePercent != nil {
		t.Fatalf("expected nil node usage after metrics failure, got %#v", envelope.Data.Nodes)
	}
	if len(envelope.Data.AppWorkloads) != 0 {
		t.Fatalf("expected empty app workloads when app namespaces are empty")
	}
}

func kubernetesTestConfig(namespaces []string, appNamespaces []string) []models.KubernetesCollectTarget {
	return []models.KubernetesCollectTarget{
		{
			ID:            "test-k8s",
			Name:          "Test Kubernetes",
			ClusterName:   "test-cluster",
			APIURL:        os.Getenv("KUBERNETES_API_URL"),
			Token:         os.Getenv("KUBERNETES_BEARER_TOKEN"),
			Namespaces:    namespaces,
			AppNamespaces: appNamespaces,
		},
	}
}

func kubernetesTestHandler(routes map[string]any) http.Handler {
	mux := http.NewServeMux()
	for path, payload := range routes {
		path := path
		payload := payload
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if status, ok := payload.(int); ok {
				w.WriteHeader(status)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(payload)
		})
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})
	return mux
}

func kubernetesTestList(items []any) map[string]any {
	return map[string]any{"items": items}
}

func kubernetesTestNode(name string, ready bool, cpu string, memory string) map[string]any {
	conditionStatus := "False"
	if ready {
		conditionStatus = "True"
	}
	return map[string]any{
		"metadata": map[string]any{"name": name},
		"status": map[string]any{
			"allocatable": map[string]any{"cpu": cpu, "memory": memory},
			"conditions": []any{
				map[string]any{"type": "Ready", "status": conditionStatus},
			},
		},
	}
}

func kubernetesTestPod(namespace string, name string, ready bool, restartCount int, ownerKind string, ownerName string, controller bool) map[string]any {
	conditionStatus := "False"
	if ready {
		conditionStatus = "True"
	}
	return map[string]any{
		"metadata": map[string]any{
			"name":      name,
			"namespace": namespace,
			"ownerReferences": []any{
				map[string]any{"kind": ownerKind, "name": ownerName, "controller": controller},
			},
		},
		"status": map[string]any{
			"conditions": []any{
				map[string]any{"type": "Ready", "status": conditionStatus},
			},
			"containerStatuses": []any{
				map[string]any{"restartCount": restartCount},
			},
		},
	}
}

func kubernetesTestReplicaSet(namespace string, name string, deploymentName string) map[string]any {
	return map[string]any{
		"metadata": map[string]any{
			"name":      name,
			"namespace": namespace,
			"ownerReferences": []any{
				map[string]any{"kind": "Deployment", "name": deploymentName, "controller": true},
			},
		},
	}
}

func kubernetesTestDeployment(namespace string, name string, desired int, ready int, replicas int, updated int, available int, unavailable int, progressingReason string) map[string]any {
	return map[string]any{
		"metadata": map[string]any{"name": name, "namespace": namespace},
		"spec":     map[string]any{"replicas": desired},
		"status": map[string]any{
			"readyReplicas":       ready,
			"replicas":            replicas,
			"updatedReplicas":     updated,
			"availableReplicas":   available,
			"unavailableReplicas": unavailable,
			"conditions": []any{
				map[string]any{"type": "Progressing", "status": "True", "reason": progressingReason},
			},
		},
	}
}

func kubernetesTestStatefulSet(namespace string, name string, desired int, ready int, replicas int, updated int, available int, unavailable int) map[string]any {
	return map[string]any{
		"metadata": map[string]any{"name": name, "namespace": namespace},
		"spec":     map[string]any{"replicas": desired},
		"status": map[string]any{
			"readyReplicas":       ready,
			"replicas":            replicas,
			"updatedReplicas":     updated,
			"availableReplicas":   available,
			"unavailableReplicas": unavailable,
		},
	}
}
