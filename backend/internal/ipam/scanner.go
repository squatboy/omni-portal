package ipam

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"omni-backend/internal/models"
	"omni-backend/internal/store"
)

const WorkerCount = 64

type Code string

const (
	CodeValidation     Code = "validation"
	CodeNotFound       Code = "not_found"
	CodeAlreadyRunning Code = "already_running"
	CodeConflict       Code = "conflict"
	CodeInternal       Code = "internal"
)

type codedError struct {
	code Code
	err  error
}

func (e codedError) Error() string {
	return e.err.Error()
}

func (e codedError) Unwrap() error {
	return e.err
}

func ErrorCode(err error) Code {
	if err == nil {
		return ""
	}
	var coded codedError
	if errors.As(err, &coded) {
		return coded.code
	}
	switch {
	case errors.Is(err, store.ErrValidation):
		return CodeValidation
	case errors.Is(err, store.ErrNotFound):
		return CodeNotFound
	case errors.Is(err, store.ErrConflict):
		return CodeConflict
	}
	return CodeInternal
}

func withCode(code Code, err error) error {
	if err == nil {
		return nil
	}
	return codedError{code: code, err: err}
}

type Prober interface {
	Probe(ctx context.Context, address string) error
}

type Clock interface {
	Now() time.Time
}

type realClock struct{}

func (realClock) Now() time.Time {
	return time.Now().UTC()
}

type ScanLease struct {
	SubnetID  string
	StartedAt time.Time
}

type ScanClaim struct {
	Lease     ScanLease
	Addresses []models.IPAMScanAddress
}

type ScanDueRequest struct {
	Limit int
}

type DueScanReport struct {
	Claimed   int
	Completed int
	Failed    int
	Skipped   int
}

type ScanExecutor interface {
	RescanSubnet(ctx context.Context, subnetID string) (models.IPAMScanSummary, error)
	ScanDue(ctx context.Context, req ScanDueRequest) (DueScanReport, error)
}

type Repository interface {
	ClaimManualScan(ctx context.Context, subnetID string, startedAt time.Time) (ScanClaim, error)
	ClaimDueScans(ctx context.Context, now time.Time, limit int) ([]ScanClaim, int, error)
	CompleteScan(ctx context.Context, lease ScanLease, completedAt time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error)
	FailScan(ctx context.Context, lease ScanLease, completedAt time.Time, message string) (models.IPAMSubnet, error)
}

type Executor struct {
	repo   Repository
	prober Prober
	clock  Clock
}

func NewScanExecutor(repo Repository, prober Prober, clock Clock) *Executor {
	if prober == nil {
		prober = CommandPingExecutor{Timeout: 2 * time.Second}
	}
	if clock == nil {
		clock = realClock{}
	}
	return &Executor{repo: repo, prober: prober, clock: clock}
}

func (e *Executor) RescanSubnet(ctx context.Context, subnetID string) (models.IPAMScanSummary, error) {
	startedAt := e.clock.Now().UTC()
	claim, err := e.repo.ClaimManualScan(ctx, subnetID, startedAt)
	if err != nil {
		return models.IPAMScanSummary{
			SubnetID:  subnetID,
			StartedAt: startedAt.Format(time.RFC3339),
		}, err
	}
	return e.runClaim(ctx, claim)
}

func (e *Executor) ScanDue(ctx context.Context, req ScanDueRequest) (DueScanReport, error) {
	now := e.clock.Now().UTC()
	claims, skipped, err := e.repo.ClaimDueScans(ctx, now, req.Limit)
	if err != nil {
		return DueScanReport{}, err
	}

	report := DueScanReport{Claimed: len(claims), Skipped: skipped}
	for _, claim := range claims {
		if ctx.Err() != nil {
			return report, ctx.Err()
		}
		if _, err := e.runClaim(ctx, claim); err != nil {
			if ErrorCode(err) == CodeAlreadyRunning {
				report.Skipped++
				continue
			}
			report.Failed++
			continue
		}
		report.Completed++
	}
	return report, nil
}

func (e *Executor) runClaim(ctx context.Context, claim ScanClaim) (models.IPAMScanSummary, error) {
	summary := models.IPAMScanSummary{
		SubnetID:  claim.Lease.SubnetID,
		StartedAt: claim.Lease.StartedAt.Format(time.RFC3339),
	}
	results := e.scanAddresses(ctx, claim.Lease.StartedAt, claim.Addresses)
	if err := ctx.Err(); err != nil {
		e.markFailed(context.Background(), claim.Lease, err)
		return summary, err
	}

	completedAt := e.clock.Now().UTC()
	subnet, err := e.repo.CompleteScan(ctx, claim.Lease, completedAt, results)
	if err != nil {
		if ErrorCode(err) != CodeConflict {
			e.markFailed(context.Background(), claim.Lease, err)
		}
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

func (e *Executor) scanAddresses(ctx context.Context, scannedAt time.Time, addresses []models.IPAMScanAddress) []models.IPAMScanResult {
	jobs := make(chan models.IPAMScanAddress)
	results := make(chan models.IPAMScanResult, len(addresses))

	workers := min(WorkerCount, len(addresses))
	var wg sync.WaitGroup
	wg.Add(workers)
	for i := 0; i < workers; i++ {
		go func() {
			defer wg.Done()
			for address := range jobs {
				if ctx.Err() != nil {
					return
				}
				err := e.prober.Probe(ctx, address.Address)
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

func (e *Executor) markFailed(ctx context.Context, lease ScanLease, scanErr error) {
	_, _ = e.repo.FailScan(ctx, lease, e.clock.Now().UTC(), scanErr.Error())
}

type StoreRepository struct {
	store *store.Store
}

func NewStoreRepository(st *store.Store) StoreRepository {
	return StoreRepository{store: st}
}

func (r StoreRepository) ClaimManualScan(ctx context.Context, subnetID string, startedAt time.Time) (ScanClaim, error) {
	addresses, err := r.store.ClaimManualIPAMScan(ctx, subnetID, startedAt)
	if err != nil {
		return ScanClaim{}, mapClaimError(err)
	}
	return ScanClaim{
		Lease:     ScanLease{SubnetID: subnetID, StartedAt: startedAt.UTC()},
		Addresses: addresses,
	}, nil
}

func (r StoreRepository) ClaimDueScans(ctx context.Context, now time.Time, limit int) ([]ScanClaim, int, error) {
	items, skipped, err := r.store.ClaimDueIPAMScans(ctx, now, limit)
	if err != nil {
		return nil, skipped, mapStoreError(err)
	}
	claims := make([]ScanClaim, 0, len(items))
	for _, item := range items {
		claims = append(claims, ScanClaim{
			Lease:     ScanLease{SubnetID: item.SubnetID, StartedAt: item.StartedAt},
			Addresses: item.Addresses,
		})
	}
	return claims, skipped, nil
}

func (r StoreRepository) CompleteScan(ctx context.Context, lease ScanLease, completedAt time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error) {
	subnet, err := r.store.CompleteIPAMScan(ctx, lease.SubnetID, lease.StartedAt, completedAt, results)
	if err != nil {
		return models.IPAMSubnet{}, mapStoreError(err)
	}
	return subnet, nil
}

func (r StoreRepository) FailScan(ctx context.Context, lease ScanLease, completedAt time.Time, message string) (models.IPAMSubnet, error) {
	subnet, err := r.store.FailIPAMScan(ctx, lease.SubnetID, lease.StartedAt, completedAt, message)
	if err != nil {
		return models.IPAMSubnet{}, mapStoreError(err)
	}
	return subnet, nil
}

func mapClaimError(err error) error {
	if errors.Is(err, store.ErrConflict) {
		return withCode(CodeAlreadyRunning, err)
	}
	return mapStoreError(err)
}

func mapStoreError(err error) error {
	switch {
	case errors.Is(err, store.ErrValidation):
		return withCode(CodeValidation, err)
	case errors.Is(err, store.ErrNotFound):
		return withCode(CodeNotFound, err)
	case errors.Is(err, store.ErrConflict):
		return withCode(CodeConflict, err)
	default:
		return withCode(CodeInternal, err)
	}
}

type CommandPingExecutor struct {
	Timeout time.Duration
}

func (p CommandPingExecutor) Probe(ctx context.Context, address string) error {
	if idx := strings.Index(address, "/"); idx != -1 {
		address = address[:idx]
	}
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
