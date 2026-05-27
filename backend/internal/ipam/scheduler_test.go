package ipam

import (
	"context"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestSchedulerScanDueScansEachDueSubnet(t *testing.T) {
	executor := &recordingScanExecutor{}
	scheduler := NewScheduler(executor, time.Minute)

	scheduler.scanDue(context.Background())

	if executor.calls != 1 {
		t.Fatalf("expected one due scan call, got %d", executor.calls)
	}
	if executor.limit != 10 {
		t.Fatalf("expected due scan limit 10, got %d", executor.limit)
	}
}

type recordingScanExecutor struct {
	calls int
	limit int
}

func (s *recordingScanExecutor) RescanSubnet(context.Context, string) (models.IPAMScanSummary, error) {
	return models.IPAMScanSummary{}, nil
}

func (s *recordingScanExecutor) ScanDue(_ context.Context, req ScanDueRequest) (DueScanReport, error) {
	s.calls++
	s.limit = req.Limit
	return DueScanReport{Claimed: 2, Completed: 2}, nil
}
