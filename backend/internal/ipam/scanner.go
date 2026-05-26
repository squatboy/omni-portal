package ipam

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"sync"
	"time"

	"omni-backend/internal/models"
)

const WorkerCount = 64

type PingExecutor interface {
	Ping(ctx context.Context, address string) error
}

type Store interface {
	MarkIPAMScanStarted(ctx context.Context, subnetID string, startedAt time.Time) error
	MarkIPAMScanFailed(ctx context.Context, subnetID string, completedAt time.Time, message string) (models.IPAMSubnet, error)
	ListIPAMScanAddresses(ctx context.Context, subnetID string) ([]models.IPAMScanAddress, error)
	BulkApplyIPAMScanResults(ctx context.Context, subnetID string, completedAt time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error)
}

type Scanner struct {
	store Store
	ping  PingExecutor
}

func NewScanner(store Store, ping PingExecutor) *Scanner {
	if ping == nil {
		ping = CommandPingExecutor{Timeout: 2 * time.Second}
	}
	return &Scanner{store: store, ping: ping}
}

func (s *Scanner) ScanSubnet(ctx context.Context, subnetID string) (models.IPAMScanSummary, error) {
	startedAt := time.Now().UTC()
	summary := models.IPAMScanSummary{
		SubnetID:  subnetID,
		StartedAt: startedAt.Format(time.RFC3339),
	}
	if err := s.store.MarkIPAMScanStarted(ctx, subnetID, startedAt); err != nil {
		return summary, err
	}

	addresses, err := s.store.ListIPAMScanAddresses(ctx, subnetID)
	if err != nil {
		s.markFailed(context.Background(), subnetID, err)
		return summary, err
	}

	results := s.scanAddresses(ctx, startedAt, addresses)
	if err := ctx.Err(); err != nil {
		s.markFailed(context.Background(), subnetID, err)
		return summary, err
	}

	completedAt := time.Now().UTC()
	subnet, err := s.store.BulkApplyIPAMScanResults(ctx, subnetID, completedAt, results)
	if err != nil {
		s.markFailed(context.Background(), subnetID, err)
		return summary, err
	}

	summary.CompletedAt = completedAt.Format(time.RFC3339)
	summary.Subnet = subnet
	for _, result := range results {
		summary.Total++
		switch result.Status {
		case models.IPAMAddressUsed:
			summary.Used++
		case models.IPAMAddressOffline:
			summary.Offline++
		default:
			summary.Free++
		}
	}
	return summary, nil
}

func (s *Scanner) scanAddresses(ctx context.Context, scannedAt time.Time, addresses []models.IPAMScanAddress) []models.IPAMScanResult {
	jobs := make(chan models.IPAMScanAddress)
	results := make(chan models.IPAMScanResult, len(addresses))

	var wg sync.WaitGroup
	wg.Add(WorkerCount)
	for i := 0; i < WorkerCount; i++ {
		go func() {
			defer wg.Done()
			for address := range jobs {
				if ctx.Err() != nil {
					return
				}
				err := s.ping.Ping(ctx, address.Address)
				results <- classifyScanResult(address, scannedAt, err == nil)
			}
		}()
	}

	go func() {
		defer close(jobs)
		for _, address := range addresses {
			select {
			case <-ctx.Done():
				return
			case jobs <- address:
			}
		}
	}()

	go func() {
		wg.Wait()
		close(results)
	}()

	scanned := make([]models.IPAMScanResult, 0, len(addresses))
	for result := range results {
		scanned = append(scanned, result)
	}
	return scanned
}

func classifyScanResult(address models.IPAMScanAddress, scannedAt time.Time, success bool) models.IPAMScanResult {
	result := models.IPAMScanResult{
		AddressID:     address.ID,
		LastScannedAt: scannedAt,
		LastSeenAt:    address.LastSeenAt,
	}
	if success {
		seenAt := scannedAt
		result.Status = models.IPAMAddressUsed
		result.LastSeenAt = &seenAt
		result.ConsecutiveFailures = 0
		return result
	}

	failures := address.ConsecutiveFailures + 1
	result.ConsecutiveFailures = failures
	hadSuccess := address.LastSeenAt != nil || address.Status == models.IPAMAddressUsed || address.Status == models.IPAMAddressOffline
	switch {
	case !hadSuccess:
		result.Status = models.IPAMAddressFree
	case failures >= 3:
		result.Status = models.IPAMAddressOffline
	default:
		result.Status = models.IPAMAddressUsed
	}
	return result
}

func (s *Scanner) markFailed(ctx context.Context, subnetID string, scanErr error) {
	_, _ = s.store.MarkIPAMScanFailed(ctx, subnetID, time.Now().UTC(), scanErr.Error())
}

type CommandPingExecutor struct {
	Timeout time.Duration
}

func (p CommandPingExecutor) Ping(ctx context.Context, address string) error {
	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}
	pingCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	args := pingArgs(address)
	cmd := exec.CommandContext(pingCtx, "ping", args...)
	if err := cmd.Run(); err != nil {
		if errors.Is(pingCtx.Err(), context.Canceled) {
			return pingCtx.Err()
		}
		return err
	}
	return nil
}

func pingArgs(address string) []string {
	switch runtime.GOOS {
	case "darwin", "freebsd", "openbsd", "netbsd":
		return []string{"-c", "1", "-W", "1000", address}
	case "windows":
		return []string{"-n", "1", "-w", "1000", address}
	default:
		return []string{"-c", "1", "-W", "1", address}
	}
}
