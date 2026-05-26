package ipam

import (
	"context"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestScannerStatusTransitions(t *testing.T) {
	seenAt := time.Date(2026, 5, 22, 9, 0, 0, 0, time.UTC)
	st := &fakeStore{
		addresses: []models.IPAMScanAddress{
			{ID: "ip-1", SubnetID: "subnet-1", Address: "10.0.0.1", Status: models.IPAMAddressFree},
			{ID: "ip-2", SubnetID: "subnet-1", Address: "10.0.0.2", Status: models.IPAMAddressUsed, LastSeenAt: &seenAt, ConsecutiveFailures: 2},
			{ID: "ip-3", SubnetID: "subnet-1", Address: "10.0.0.3", Status: models.IPAMAddressFree, ConsecutiveFailures: 2},
		},
	}
	scanner := NewScanner(st, fakePing{success: map[string]bool{"10.0.0.1": true}})

	summary, err := scanner.ScanSubnet(context.Background(), "subnet-1")
	if err != nil {
		t.Fatalf("scan subnet: %v", err)
	}
	if summary.Total != 3 || summary.Used != 1 || summary.Offline != 1 || summary.Free != 1 {
		t.Fatalf("unexpected summary: %#v", summary)
	}

	results := st.resultsByAddressID()
	if got := results["ip-1"]; got.Status != models.IPAMAddressUsed || got.ConsecutiveFailures != 0 || got.LastSeenAt == nil {
		t.Fatalf("expected free success to become used, got %#v", got)
	}
	if got := results["ip-2"]; got.Status != models.IPAMAddressOffline || got.ConsecutiveFailures != 3 {
		t.Fatalf("expected third failure after success history to become offline, got %#v", got)
	}
	if got := results["ip-3"]; got.Status != models.IPAMAddressFree || got.ConsecutiveFailures != 3 {
		t.Fatalf("expected never-success failure to remain free, got %#v", got)
	}
	if st.bulkCalls != 1 {
		t.Fatalf("expected one bulk apply call, got %d", st.bulkCalls)
	}
}

func TestScannerUsesFixedWorkerPoolAndBulkApply(t *testing.T) {
	addresses := make([]models.IPAMScanAddress, 128)
	for i := range addresses {
		octet := strconv.Itoa(i + 1)
		addresses[i] = models.IPAMScanAddress{
			ID:       "ip-" + octet,
			SubnetID: "subnet-1",
			Address:  "10.0.1." + octet,
			Status:   models.IPAMAddressFree,
		}
	}
	st := &fakeStore{addresses: addresses}
	ping := &trackingPing{delay: time.Millisecond}
	scanner := NewScanner(st, ping)

	if _, err := scanner.ScanSubnet(context.Background(), "subnet-1"); err != nil {
		t.Fatalf("scan subnet: %v", err)
	}
	if st.bulkCalls != 1 {
		t.Fatalf("expected one bulk apply call, got %d", st.bulkCalls)
	}
	if len(st.applied) != len(addresses) {
		t.Fatalf("expected %d applied results, got %d", len(addresses), len(st.applied))
	}
	if max := ping.max.Load(); max > WorkerCount {
		t.Fatalf("expected at most %d concurrent pings, got %d", WorkerCount, max)
	}
	if ping.calls.Load() != int64(len(addresses)) {
		t.Fatalf("expected %d ping calls, got %d", len(addresses), ping.calls.Load())
	}
}

type fakePing struct {
	success map[string]bool
}

func (p fakePing) Ping(_ context.Context, address string) error {
	if p.success[address] {
		return nil
	}
	return context.DeadlineExceeded
}

type trackingPing struct {
	active atomic.Int64
	max    atomic.Int64
	calls  atomic.Int64
	delay  time.Duration
}

func (p *trackingPing) Ping(ctx context.Context, _ string) error {
	p.calls.Add(1)
	active := p.active.Add(1)
	for {
		max := p.max.Load()
		if active <= max || p.max.CompareAndSwap(max, active) {
			break
		}
	}
	defer p.active.Add(-1)

	timer := time.NewTimer(p.delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

type fakeStore struct {
	mu        sync.Mutex
	addresses []models.IPAMScanAddress
	applied   []models.IPAMScanResult
	bulkCalls int
}

func (s *fakeStore) MarkIPAMScanStarted(context.Context, string, time.Time) error {
	return nil
}

func (s *fakeStore) MarkIPAMScanFailed(context.Context, string, time.Time, string) (models.IPAMSubnet, error) {
	return models.IPAMSubnet{}, nil
}

func (s *fakeStore) ListIPAMScanAddresses(context.Context, string) ([]models.IPAMScanAddress, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make([]models.IPAMScanAddress, len(s.addresses))
	copy(items, s.addresses)
	return items, nil
}

func (s *fakeStore) BulkApplyIPAMScanResults(_ context.Context, subnetID string, _ time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bulkCalls++
	s.applied = append([]models.IPAMScanResult(nil), results...)
	return models.IPAMSubnet{ID: subnetID}, nil
}

func (s *fakeStore) resultsByAddressID() map[string]models.IPAMScanResult {
	s.mu.Lock()
	defer s.mu.Unlock()
	items := make(map[string]models.IPAMScanResult, len(s.applied))
	for _, result := range s.applied {
		items[result.AddressID] = result
	}
	return items
}
