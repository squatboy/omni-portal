package ipam

import (
	"context"
	"errors"
	"log"
	"time"

	"omni-backend/internal/models"
	"omni-backend/internal/store"
)

const defaultSchedulerInterval = time.Minute

type SchedulerStore interface {
	ListDueIPAMSubnets(ctx context.Context, now time.Time, limit int) ([]models.IPAMSubnet, error)
}

type Scheduler struct {
	store    SchedulerStore
	scanner  *Scanner
	interval time.Duration
}

func NewScheduler(store SchedulerStore, scanner *Scanner, interval time.Duration) *Scheduler {
	if interval <= 0 {
		interval = defaultSchedulerInterval
	}
	return &Scheduler{store: store, scanner: scanner, interval: interval}
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
	subnets, err := s.store.ListDueIPAMSubnets(ctx, time.Now().UTC(), 10)
	if err != nil {
		log.Printf("ipam scheduler due subnet lookup failed: %v", err)
		return
	}
	for _, subnet := range subnets {
		if ctx.Err() != nil {
			return
		}
		if _, err := s.scanner.ScanSubnet(ctx, subnet.ID); err != nil {
			if errors.Is(err, store.ErrConflict) {
				continue
			}
			log.Printf("ipam scheduled scan failed subnet=%s: %v", subnet.ID, err)
		}
	}
}
