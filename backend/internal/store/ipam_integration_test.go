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
