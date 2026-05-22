package ipam

import (
	"context"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestSchedulerScanDueScansEachDueSubnet(t *testing.T) {
	schedulerStore := &fakeSchedulerStore{
		subnets: []models.IPAMSubnet{
			{ID: "subnet-1", AutoDiscovery: true},
			{ID: "subnet-2", AutoDiscovery: true},
		},
	}
	scanStore := &recordingScanStore{}
	scheduler := NewScheduler(schedulerStore, NewScanner(scanStore, fakePing{}), time.Minute)

	scheduler.scanDue(context.Background())

	if schedulerStore.calls != 1 {
		t.Fatalf("expected one due subnet lookup, got %d", schedulerStore.calls)
	}
	if schedulerStore.limit != 10 {
		t.Fatalf("expected due subnet lookup limit 10, got %d", schedulerStore.limit)
	}
	if schedulerStore.now.IsZero() {
		t.Fatal("expected due subnet lookup to receive current time")
	}

	want := []string{"subnet-1", "subnet-2"}
	if !sameStrings(scanStore.started, want) {
		t.Fatalf("expected scans for %v, got %v", want, scanStore.started)
	}
}

type fakeSchedulerStore struct {
	subnets []models.IPAMSubnet
	calls   int
	now     time.Time
	limit   int
}

func (s *fakeSchedulerStore) ListDueIPAMSubnets(_ context.Context, now time.Time, limit int) ([]models.IPAMSubnet, error) {
	s.calls++
	s.now = now
	s.limit = limit
	items := make([]models.IPAMSubnet, len(s.subnets))
	copy(items, s.subnets)
	return items, nil
}

type recordingScanStore struct {
	started []string
}

func (s *recordingScanStore) MarkIPAMScanStarted(_ context.Context, subnetID string, _ time.Time) error {
	s.started = append(s.started, subnetID)
	return nil
}

func (s *recordingScanStore) MarkIPAMScanFailed(context.Context, string, time.Time, string) (models.IPAMSubnet, error) {
	return models.IPAMSubnet{}, nil
}

func (s *recordingScanStore) ListIPAMScanAddresses(context.Context, string) ([]models.IPAMScanAddress, error) {
	return nil, nil
}

func (s *recordingScanStore) BulkApplyIPAMScanResults(_ context.Context, subnetID string, _ time.Time, _ []models.IPAMScanResult) (models.IPAMSubnet, error) {
	return models.IPAMSubnet{ID: subnetID}, nil
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
