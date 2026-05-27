package ipam

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestScannerStatusTransitions(t *testing.T) {
	seenAt := time.Date(2026, 5, 22, 9, 0, 0, 0, time.UTC)
	startedAt := time.Date(2026, 5, 27, 9, 0, 0, 0, time.UTC)
	completedAt := time.Date(2026, 5, 27, 9, 1, 0, 0, time.UTC)
	st := &fakeStore{
		startedAt: startedAt,
		addresses: []models.IPAMScanAddress{
			{ID: "ip-1", SubnetID: "subnet-1", Address: "10.0.0.1", Status: models.IPAMAddressFree},
			{ID: "ip-2", SubnetID: "subnet-1", Address: "10.0.0.2", Status: models.IPAMAddressUsed, LastSeenAt: &seenAt, ConsecutiveFailures: 2},
			{ID: "ip-3", SubnetID: "subnet-1", Address: "10.0.0.3", Status: models.IPAMAddressFree, ConsecutiveFailures: 2},
		},
	}
	executor := NewScanExecutor(st, fakePing{success: map[string]bool{"10.0.0.1": true}}, &fakeClock{times: []time.Time{startedAt, completedAt}})

	summary, err := executor.RescanSubnet(context.Background(), "subnet-1")
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
	startedAt := time.Date(2026, 5, 27, 10, 0, 0, 0, time.UTC)
	completedAt := time.Date(2026, 5, 27, 10, 1, 0, 0, time.UTC)
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
	st := &fakeStore{startedAt: startedAt, addresses: addresses}
	ping := &trackingPing{delay: time.Millisecond}
	executor := NewScanExecutor(st, ping, &fakeClock{times: []time.Time{startedAt, completedAt}})

	if _, err := executor.RescanSubnet(context.Background(), "subnet-1"); err != nil {
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

func TestExecutorManualConflictReturnsAlreadyRunning(t *testing.T) {
	st := &fakeStore{claimErr: storeConflict("subnet scan already running")}
	executor := NewScanExecutor(st, fakePing{}, &fakeClock{times: []time.Time{time.Date(2026, 5, 27, 11, 0, 0, 0, time.UTC)}})

	if _, err := executor.RescanSubnet(context.Background(), "subnet-1"); ErrorCode(err) != CodeAlreadyRunning {
		t.Fatalf("expected already_running error code, got err=%v code=%s", err, ErrorCode(err))
	}
}

func TestExecutorScanDueSkipsRunningAndCountsFailures(t *testing.T) {
	startedAt := time.Date(2026, 5, 27, 12, 0, 0, 0, time.UTC)
	completedAt := time.Date(2026, 5, 27, 12, 1, 0, 0, time.UTC)
	st := &fakeStore{
		startedAt:  startedAt,
		dueSkipped: 1,
		dueClaims: []ScanClaim{
			{Lease: ScanLease{SubnetID: "subnet-1", StartedAt: startedAt}},
			{Lease: ScanLease{SubnetID: "subnet-2", StartedAt: startedAt}},
		},
		completeErrBySubnet: map[string]error{
			"subnet-2": errors.New("write failed"),
		},
	}
	executor := NewScanExecutor(st, fakePing{}, &fakeClock{times: []time.Time{startedAt, completedAt, completedAt.Add(time.Minute)}})

	report, err := executor.ScanDue(context.Background(), ScanDueRequest{Limit: 10})
	if err != nil {
		t.Fatalf("scan due: %v", err)
	}
	if report.Claimed != 2 || report.Completed != 1 || report.Failed != 1 || report.Skipped != 1 {
		t.Fatalf("unexpected report: %#v", report)
	}
	if len(st.failed) != 1 || st.failed[0] != "subnet-2" {
		t.Fatalf("expected failed subnet-2, got %v", st.failed)
	}
}

type fakePing struct {
	success map[string]bool
}

func (p fakePing) Probe(_ context.Context, address string) error {
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

func (p *trackingPing) Probe(ctx context.Context, _ string) error {
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
	mu                  sync.Mutex
	startedAt           time.Time
	addresses           []models.IPAMScanAddress
	applied             []models.IPAMScanResult
	bulkCalls           int
	claimErr            error
	dueClaims           []ScanClaim
	dueSkipped          int
	completeErrBySubnet map[string]error
	failed              []string
}

func (s *fakeStore) ClaimManualScan(context.Context, string, time.Time) (ScanClaim, error) {
	if s.claimErr != nil {
		return ScanClaim{}, s.claimErr
	}
	return ScanClaim{
		Lease:     ScanLease{SubnetID: "subnet-1", StartedAt: s.startedAt},
		Addresses: append([]models.IPAMScanAddress(nil), s.addresses...),
	}, nil
}

func (s *fakeStore) ClaimDueScans(context.Context, time.Time, int) ([]ScanClaim, int, error) {
	return append([]ScanClaim(nil), s.dueClaims...), s.dueSkipped, nil
}

func (s *fakeStore) CompleteScan(_ context.Context, lease ScanLease, _ time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error) {
	if err := s.completeErrBySubnet[lease.SubnetID]; err != nil {
		return models.IPAMSubnet{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.bulkCalls++
	s.applied = append([]models.IPAMScanResult(nil), results...)
	return models.IPAMSubnet{ID: lease.SubnetID}, nil
}

func (s *fakeStore) FailScan(_ context.Context, lease ScanLease, _ time.Time, _ string) (models.IPAMSubnet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.failed = append(s.failed, lease.SubnetID)
	return models.IPAMSubnet{ID: lease.SubnetID}, nil
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

type fakeClock struct {
	mu    sync.Mutex
	times []time.Time
}

func (c *fakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.times) == 0 {
		return time.Now().UTC()
	}
	value := c.times[0]
	c.times = c.times[1:]
	return value
}

func storeConflict(message string) error {
	return withCode(CodeAlreadyRunning, errors.New(message))
}
