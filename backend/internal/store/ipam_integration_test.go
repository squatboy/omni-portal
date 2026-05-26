package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"omni-backend/internal/models"
)

func TestIPAMPostgresCreateOverlapAndCascade(t *testing.T) {
	databaseURL := os.Getenv("OMNI_IPAM_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set OMNI_IPAM_TEST_DATABASE_URL to run PostgreSQL-backed IPAM integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	st, err := Open(ctx, databaseURL, []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	suffix := time.Now().UnixNano()
	actorID := "test-ipam"
	location, err := st.CreateIPAMLocation(ctx, actorID, models.IPAMLocation{
		Name: fmt.Sprintf("ipam-it-%d", suffix),
	})
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	defer st.DeleteIPAMLocation(context.Background(), location.ID)

	networkA, err := st.CreateIPAMNetwork(ctx, actorID, models.IPAMNetwork{
		LocationID: location.ID,
		Name:       "network-a",
	})
	if err != nil {
		t.Fatalf("create network A: %v", err)
	}
	networkB, err := st.CreateIPAMNetwork(ctx, actorID, models.IPAMNetwork{
		LocationID: location.ID,
		Name:       "network-b",
	})
	if err != nil {
		t.Fatalf("create network B: %v", err)
	}

	subnet, err := st.CreateIPAMSubnet(ctx, actorID, models.IPAMSubnet{
		NetworkID: networkA.ID,
		Name:      "subnet-a",
		CIDR:      "10.211.0.0/24",
	})
	if err != nil {
		t.Fatalf("create subnet: %v", err)
	}

	var addressCount int
	if err := st.db.QueryRowContext(ctx, `SELECT count(*) FROM ipam_addresses WHERE subnet_id=$1`, subnet.ID).Scan(&addressCount); err != nil {
		t.Fatalf("count addresses: %v", err)
	}
	if addressCount != 254 {
		t.Fatalf("expected 254 generated addresses, got %d", addressCount)
	}

	_, err = st.CreateIPAMSubnet(ctx, actorID, models.IPAMSubnet{
		NetworkID: networkB.ID,
		Name:      "overlap",
		CIDR:      "10.211.0.128/25",
	})
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("expected overlap conflict, got %v", err)
	}

	if err := st.DeleteIPAMLocation(ctx, location.ID); err != nil {
		t.Fatalf("delete location: %v", err)
	}

	assertNoRowsForID(t, ctx, st, "ipam_networks", networkA.ID)
	assertNoRowsForID(t, ctx, st, "ipam_networks", networkB.ID)
	assertNoRowsForID(t, ctx, st, "ipam_subnets", subnet.ID)

	if err := st.db.QueryRowContext(ctx, `SELECT count(*) FROM ipam_addresses WHERE subnet_id=$1`, subnet.ID).Scan(&addressCount); err != nil {
		t.Fatalf("count addresses after cascade: %v", err)
	}
	if addressCount != 0 {
		t.Fatalf("expected cascade to remove subnet addresses, got %d", addressCount)
	}
}

func TestIPAMPostgresBulkApplyScanResults(t *testing.T) {
	databaseURL := os.Getenv("OMNI_IPAM_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set OMNI_IPAM_TEST_DATABASE_URL to run PostgreSQL-backed IPAM integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	st, err := Open(ctx, databaseURL, []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	suffix := time.Now().UnixNano()
	actorID := "test-ipam"
	location, err := st.CreateIPAMLocation(ctx, actorID, models.IPAMLocation{
		Name: fmt.Sprintf("ipam-bulk-%d", suffix),
	})
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	defer st.DeleteIPAMLocation(context.Background(), location.ID)

	network, err := st.CreateIPAMNetwork(ctx, actorID, models.IPAMNetwork{
		LocationID: location.ID,
		Name:       "network-a",
	})
	if err != nil {
		t.Fatalf("create network: %v", err)
	}
	subnet, err := st.CreateIPAMSubnet(ctx, actorID, models.IPAMSubnet{
		NetworkID: network.ID,
		Name:      "subnet-a",
		CIDR:      "10.212.0.0/30",
	})
	if err != nil {
		t.Fatalf("create subnet: %v", err)
	}
	if err := st.MarkIPAMScanStarted(ctx, subnet.ID, time.Now().UTC()); err != nil {
		t.Fatalf("mark started: %v", err)
	}

	addresses, err := st.ListIPAMScanAddresses(ctx, subnet.ID)
	if err != nil {
		t.Fatalf("list scan addresses: %v", err)
	}
	if len(addresses) != 2 {
		t.Fatalf("expected 2 scan addresses, got %d", len(addresses))
	}

	scannedAt := time.Now().UTC()
	seenAt := scannedAt
	updated, err := st.BulkApplyIPAMScanResults(ctx, subnet.ID, scannedAt, []models.IPAMScanResult{
		{AddressID: addresses[0].ID, Status: models.IPAMAddressUsed, LastScannedAt: scannedAt, LastSeenAt: &seenAt},
		{AddressID: addresses[1].ID, Status: models.IPAMAddressFree, LastScannedAt: scannedAt, ConsecutiveFailures: 1},
	})
	if err != nil {
		t.Fatalf("bulk apply scan results: %v", err)
	}
	if updated.LastScanStatus == nil || *updated.LastScanStatus != "completed" {
		t.Fatalf("expected completed scan status, got %#v", updated.LastScanStatus)
	}

	items, err := st.ListIPAMAddresses(ctx, subnet.ID)
	if err != nil {
		t.Fatalf("list addresses: %v", err)
	}
	if items[0].Status != models.IPAMAddressUsed || items[0].LastSeenAt == nil {
		t.Fatalf("expected first address used with lastSeenAt, got %#v", items[0])
	}
	if items[1].Status != models.IPAMAddressFree || items[1].ConsecutiveFailures != 1 {
		t.Fatalf("expected second address free with one failure, got %#v", items[1])
	}

	history, err := st.ListIPAMScanHistory(ctx, 20)
	if err != nil {
		t.Fatalf("list scan history: %v", err)
	}
	completedHistory := latestHistoryForSubnet(history, subnet.ID)
	if completedHistory == nil {
		t.Fatalf("expected completed scan history row for subnet %s", subnet.ID)
	}
	if completedHistory.Status != models.IPAMScanHistoryCompleted {
		t.Fatalf("expected completed history status, got %q", completedHistory.Status)
	}
	if completedHistory.Total == nil || *completedHistory.Total != 2 {
		t.Fatalf("expected total count 2, got %#v", completedHistory.Total)
	}
	detail, err := st.IPAMScanHistoryDetail(ctx, completedHistory.ID)
	if err != nil {
		t.Fatalf("scan history detail: %v", err)
	}
	if len(detail.Changes) != 1 {
		t.Fatalf("expected only one status change, got %#v", detail.Changes)
	}
	if detail.Changes[0].PreviousStatus != models.IPAMAddressFree || detail.Changes[0].CurrentStatus != models.IPAMAddressUsed {
		t.Fatalf("expected free to used transition, got %#v", detail.Changes[0])
	}

	secondSeenAt := scannedAt.Add(time.Minute)
	if _, err := st.BulkApplyIPAMScanResults(ctx, subnet.ID, secondSeenAt, []models.IPAMScanResult{
		{AddressID: addresses[0].ID, Status: models.IPAMAddressUsed, LastScannedAt: secondSeenAt, LastSeenAt: &secondSeenAt},
		{AddressID: addresses[1].ID, Status: models.IPAMAddressFree, LastScannedAt: secondSeenAt, ConsecutiveFailures: 2},
	}); err != nil {
		t.Fatalf("second bulk apply scan results: %v", err)
	}
	history, err = st.ListIPAMScanHistory(ctx, 20)
	if err != nil {
		t.Fatalf("list scan history after second scan: %v", err)
	}
	secondHistory := latestHistoryForSubnet(history, subnet.ID)
	if secondHistory == nil {
		t.Fatalf("expected second scan history row for subnet %s", subnet.ID)
	}
	detail, err = st.IPAMScanHistoryDetail(ctx, secondHistory.ID)
	if err != nil {
		t.Fatalf("second scan history detail: %v", err)
	}
	if len(detail.Changes) != 0 {
		t.Fatalf("expected unchanged statuses to skip change rows, got %#v", detail.Changes)
	}
}

func TestIPAMPostgresScanHistoryRetentionAndFailedRows(t *testing.T) {
	databaseURL := os.Getenv("OMNI_IPAM_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("set OMNI_IPAM_TEST_DATABASE_URL to run PostgreSQL-backed IPAM integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	st, err := Open(ctx, databaseURL, []byte("0123456789abcdef0123456789abcdef"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer st.Close()

	if err := st.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	suffix := time.Now().UnixNano()
	actorID := "test-ipam"
	location, err := st.CreateIPAMLocation(ctx, actorID, models.IPAMLocation{
		Name: fmt.Sprintf("ipam-history-%d", suffix),
	})
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	defer st.DeleteIPAMLocation(context.Background(), location.ID)

	network, err := st.CreateIPAMNetwork(ctx, actorID, models.IPAMNetwork{
		LocationID: location.ID,
		Name:       "network-a",
	})
	if err != nil {
		t.Fatalf("create network: %v", err)
	}
	subnet, err := st.CreateIPAMSubnet(ctx, actorID, models.IPAMSubnet{
		NetworkID: network.ID,
		Name:      "subnet-a",
		CIDR:      "10.213.0.0/30",
	})
	if err != nil {
		t.Fatalf("create subnet: %v", err)
	}
	addresses, err := st.ListIPAMScanAddresses(ctx, subnet.ID)
	if err != nil {
		t.Fatalf("list scan addresses: %v", err)
	}

	baseTime := time.Now().UTC().Add(-time.Hour)
	for i := 0; i < 21; i++ {
		completedAt := baseTime.Add(time.Duration(i) * time.Minute)
		seenAt := completedAt
		if _, err := st.BulkApplyIPAMScanResults(ctx, subnet.ID, completedAt, []models.IPAMScanResult{
			{AddressID: addresses[0].ID, Status: models.IPAMAddressUsed, LastScannedAt: completedAt, LastSeenAt: &seenAt},
			{AddressID: addresses[1].ID, Status: models.IPAMAddressFree, LastScannedAt: completedAt},
		}); err != nil {
			t.Fatalf("bulk apply scan %d: %v", i, err)
		}
	}

	var count int
	if err := st.db.QueryRowContext(ctx, `SELECT count(*) FROM ipam_scan_history WHERE subnet_id=$1`, subnet.ID).Scan(&count); err != nil {
		t.Fatalf("count scan history: %v", err)
	}
	if count != 20 {
		t.Fatalf("expected retention to keep 20 history rows, got %d", count)
	}

	failedAt := baseTime.Add(30 * time.Minute)
	updated, err := st.MarkIPAMScanFailed(ctx, subnet.ID, failedAt, "ping failed")
	if err != nil {
		t.Fatalf("mark failed: %v", err)
	}
	if updated.LastScanStatus == nil || *updated.LastScanStatus != "failed" {
		t.Fatalf("expected subnet failed status, got %#v", updated.LastScanStatus)
	}
	if err := st.db.QueryRowContext(ctx, `SELECT count(*) FROM ipam_scan_history WHERE subnet_id=$1`, subnet.ID).Scan(&count); err != nil {
		t.Fatalf("count scan history after failure: %v", err)
	}
	if count != 20 {
		t.Fatalf("expected retention after failed row to keep 20 history rows, got %d", count)
	}
	history, err := st.ListIPAMScanHistory(ctx, 20)
	if err != nil {
		t.Fatalf("list scan history after failure: %v", err)
	}
	failedHistory := latestHistoryForSubnet(history, subnet.ID)
	if failedHistory == nil {
		t.Fatalf("expected failed scan history row for subnet %s", subnet.ID)
	}
	if failedHistory.Status != models.IPAMScanHistoryFailed || failedHistory.Error == nil {
		t.Fatalf("expected failed history row with error first, got %#v", failedHistory)
	}
	if failedHistory.Total != nil || failedHistory.Used != nil || failedHistory.Offline != nil || failedHistory.Free != nil {
		t.Fatalf("expected failed history counts to be empty, got %#v", failedHistory)
	}
}

func latestHistoryForSubnet(history []models.IPAMScanHistory, subnetID string) *models.IPAMScanHistory {
	for i := range history {
		if history[i].SubnetID == subnetID {
			return &history[i]
		}
	}
	return nil
}

func assertNoRowsForID(t *testing.T, ctx context.Context, st *Store, tableName, id string) {
	t.Helper()
	var count int
	query := fmt.Sprintf("SELECT count(*) FROM %s WHERE id=$1", tableName)
	if err := st.db.QueryRowContext(ctx, query, id).Scan(&count); err != nil {
		t.Fatalf("count %s rows: %v", tableName, err)
	}
	if count != 0 {
		t.Fatalf("expected no %s row for %s, got %d", tableName, id, count)
	}
}
