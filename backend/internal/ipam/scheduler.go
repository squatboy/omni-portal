package ipam

import (
	"context"
	"log"
	"time"
)

const defaultSchedulerInterval = time.Minute

type Scheduler struct {
	executor ScanExecutor
	interval time.Duration
}

func NewScheduler(executor ScanExecutor, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = defaultSchedulerInterval
	}
	return &Scheduler{executor: executor, interval: interval}
}

func (s *Scheduler) Start(ctx context.Context) {
	go s.run(ctx)
}

func (s *Scheduler) run(ctx context.Context) {
	s.scanDue(ctx)

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.scanDue(ctx)
		}
	}
}

func (s *Scheduler) scanDue(ctx context.Context) {
	report, err := s.executor.ScanDue(ctx, ScanDueRequest{Limit: 10})
	if err != nil {
		log.Printf("ipam scheduled scan failed: %v", err)
		return
	}
	if report.Failed > 0 {
		log.Printf("ipam scheduled scan completed with failures: claimed=%d completed=%d failed=%d skipped=%d", report.Claimed, report.Completed, report.Failed, report.Skipped)
	}
}
