package store

import (
	"context"
	"database/sql"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"omni-backend/internal/models"

	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrValidation = errors.New("validation")
	ErrNotFound   = errors.New("not found")
	ErrConflict   = errors.New("conflict")
)

var allowedIPAMScanIntervals = map[int]struct{}{
	1800:  {},
	3600:  {},
	14400: {},
	43200: {},
	86400: {},
}

const ipamScanHistoryRetentionPerSubnet = 20

func (s *Store) ListIPAMLocations(ctx context.Context) ([]models.IPAMLocation, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, description, created_at, updated_at
		FROM ipam_locations
		ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMLocation{}
	for rows.Next() {
		var item models.IPAMLocation
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.CreatedAt = createdAt.Format(time.RFC3339)
		item.UpdatedAt = updatedAt.Format(time.RFC3339)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateIPAMLocation(ctx context.Context, actorID string, item models.IPAMLocation) (models.IPAMLocation, error) {
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMLocation{}, err
	}
	id := newID("loc")
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO ipam_locations (id, name, description, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$4)
	`, id, name, description, actorID)
	if err != nil {
		return models.IPAMLocation{}, classifyIPAMWriteError(err)
	}
	return s.ipamLocationByID(ctx, id)
}

func (s *Store) UpdateIPAMLocation(ctx context.Context, actorID string, item models.IPAMLocation) (models.IPAMLocation, error) {
	if strings.TrimSpace(item.ID) == "" {
		return models.IPAMLocation{}, validationError("location id is required")
	}
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMLocation{}, err
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE ipam_locations
		SET name=$2, description=$3, updated_at=now(), updated_by=$4
		WHERE id=$1
	`, item.ID, name, description, actorID)
	if err != nil {
		return models.IPAMLocation{}, classifyIPAMWriteError(err)
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return models.IPAMLocation{}, ErrNotFound
	}
	return s.ipamLocationByID(ctx, item.ID)
}

func (s *Store) DeleteIPAMLocation(ctx context.Context, id string) error {
	return s.deleteIPAMRow(ctx, `DELETE FROM ipam_locations WHERE id=$1`, id)
}

func (s *Store) ListIPAMNetworks(ctx context.Context, locationID string) ([]models.IPAMNetwork, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, location_id, name, description, created_at, updated_at
		FROM ipam_networks
		WHERE ($1 = '' OR location_id = $1)
		ORDER BY name
	`, strings.TrimSpace(locationID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMNetwork{}
	for rows.Next() {
		var item models.IPAMNetwork
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&item.ID, &item.LocationID, &item.Name, &item.Description, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		item.CreatedAt = createdAt.Format(time.RFC3339)
		item.UpdatedAt = updatedAt.Format(time.RFC3339)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateIPAMNetwork(ctx context.Context, actorID string, item models.IPAMNetwork) (models.IPAMNetwork, error) {
	if strings.TrimSpace(item.LocationID) == "" {
		return models.IPAMNetwork{}, validationError("locationId is required")
	}
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMNetwork{}, err
	}
	id := newID("net")
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO ipam_networks (id, location_id, name, description, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$5)
	`, id, item.LocationID, name, description, actorID)
	if err != nil {
		return models.IPAMNetwork{}, classifyIPAMWriteError(err)
	}
	return s.ipamNetworkByID(ctx, id)
}

func (s *Store) UpdateIPAMNetwork(ctx context.Context, actorID string, item models.IPAMNetwork) (models.IPAMNetwork, error) {
	if strings.TrimSpace(item.ID) == "" {
		return models.IPAMNetwork{}, validationError("network id is required")
	}
	existing, err := s.ipamNetworkByID(ctx, item.ID)
	if err != nil {
		return models.IPAMNetwork{}, err
	}
	if strings.TrimSpace(item.LocationID) != "" && item.LocationID != existing.LocationID {
		return models.IPAMNetwork{}, validationError("network location is immutable")
	}
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMNetwork{}, err
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE ipam_networks
		SET name=$2, description=$3, updated_at=now(), updated_by=$4
		WHERE id=$1
	`, item.ID, name, description, actorID)
	if err != nil {
		return models.IPAMNetwork{}, classifyIPAMWriteError(err)
	}
	return s.ipamNetworkByID(ctx, item.ID)
}

func (s *Store) DeleteIPAMNetwork(ctx context.Context, id string) error {
	return s.deleteIPAMRow(ctx, `DELETE FROM ipam_networks WHERE id=$1`, id)
}

func (s *Store) ListIPAMSubnets(ctx context.Context, locationID, networkID string) ([]models.IPAMSubnet, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT s.id, s.network_id, n.location_id, s.name, s.cidr::text, s.description,
			s.auto_discovery, s.scan_interval_seconds, s.last_scan_started_at,
			s.last_scan_completed_at, s.last_scan_status, s.last_scan_error,
			s.created_at, s.updated_at
		FROM ipam_subnets s
		JOIN ipam_networks n ON n.id = s.network_id
		WHERE ($1 = '' OR n.location_id = $1)
			AND ($2 = '' OR s.network_id = $2)
		ORDER BY n.name, s.name
	`, strings.TrimSpace(locationID), strings.TrimSpace(networkID))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMSubnet{}
	for rows.Next() {
		item, err := scanIPAMSubnet(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) CreateIPAMSubnet(ctx context.Context, actorID string, item models.IPAMSubnet) (models.IPAMSubnet, error) {
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	cidr, ipNet, err := validateSubnetCIDR(item.CIDR)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	interval, err := normalizeIPAMScanInterval(item.ScanIntervalSeconds)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if strings.TrimSpace(item.NetworkID) == "" {
		return models.IPAMSubnet{}, validationError("networkId is required")
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	defer tx.Rollback()

	locationID, err := ipamLocationIDForNetwork(ctx, tx, item.NetworkID)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, locationID); err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := ensureNoIPAMSubnetOverlap(ctx, tx, locationID, cidr, ""); err != nil {
		return models.IPAMSubnet{}, err
	}

	id := newID("subnet")
	_, err = tx.ExecContext(ctx, `
		INSERT INTO ipam_subnets (
			id, network_id, name, cidr, description, auto_discovery,
			scan_interval_seconds, created_by, updated_by
		)
		VALUES ($1,$2,$3,$4::cidr,$5,$6,$7,$8,$8)
	`, id, item.NetworkID, name, cidr, description, item.AutoDiscovery, interval, actorID)
	if err != nil {
		return models.IPAMSubnet{}, classifyIPAMWriteError(err)
	}

	addresses := usableIPv4Addresses(ipNet)
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO ipam_addresses (id, subnet_id, address, status, created_by, updated_by)
		VALUES ($1,$2,$3::inet,'free',$4,$4)
	`)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	defer stmt.Close()
	for _, address := range addresses {
		if _, err := stmt.ExecContext(ctx, newID("ip"), id, address, actorID); err != nil {
			return models.IPAMSubnet{}, classifyIPAMWriteError(err)
		}
	}
	if err := tx.Commit(); err != nil {
		return models.IPAMSubnet{}, err
	}
	return s.ipamSubnetByID(ctx, id)
}

func (s *Store) UpdateIPAMSubnet(ctx context.Context, actorID string, item models.IPAMSubnet) (models.IPAMSubnet, error) {
	if strings.TrimSpace(item.ID) == "" {
		return models.IPAMSubnet{}, validationError("subnet id is required")
	}
	existing, err := s.ipamSubnetByID(ctx, item.ID)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if strings.TrimSpace(item.NetworkID) != "" && item.NetworkID != existing.NetworkID {
		return models.IPAMSubnet{}, validationError("subnet network is immutable")
	}
	if strings.TrimSpace(item.CIDR) != "" {
		cidr, _, err := validateSubnetCIDR(item.CIDR)
		if err != nil {
			return models.IPAMSubnet{}, err
		}
		if cidr != existing.CIDR {
			return models.IPAMSubnet{}, validationError("subnet CIDR is immutable")
		}
	}
	name, description, err := normalizeIPAMNameDescription(item.Name, item.Description)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	interval := item.ScanIntervalSeconds
	if interval == 0 {
		interval = existing.ScanIntervalSeconds
	}
	if _, err := normalizeIPAMScanInterval(interval); err != nil {
		return models.IPAMSubnet{}, err
	}
	_, err = s.db.ExecContext(ctx, `
		UPDATE ipam_subnets
		SET name=$2, description=$3, auto_discovery=$4,
			scan_interval_seconds=$5, updated_at=now(), updated_by=$6
		WHERE id=$1
	`, item.ID, name, description, item.AutoDiscovery, interval, actorID)
	if err != nil {
		return models.IPAMSubnet{}, classifyIPAMWriteError(err)
	}
	return s.ipamSubnetByID(ctx, item.ID)
}

func (s *Store) DeleteIPAMSubnet(ctx context.Context, id string) error {
	return s.deleteIPAMRow(ctx, `DELETE FROM ipam_subnets WHERE id=$1`, id)
}

func (s *Store) ListIPAMAddresses(ctx context.Context, subnetID string) ([]models.IPAMAddress, error) {
	if strings.TrimSpace(subnetID) == "" {
		return nil, validationError("subnet id is required")
	}
	if _, err := s.ipamSubnetByID(ctx, subnetID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, subnet_id, address::text, status, hostname, description,
			last_scanned_at, last_seen_at, consecutive_failures, created_at, updated_at
		FROM ipam_addresses
		WHERE subnet_id = $1
		ORDER BY address
	`, subnetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMAddress{}
	for rows.Next() {
		item, err := scanIPAMAddress(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) UpdateIPAMAddress(ctx context.Context, actorID string, item models.IPAMAddress) (models.IPAMAddress, error) {
	if strings.TrimSpace(item.ID) == "" {
		return models.IPAMAddress{}, validationError("address id is required")
	}
	hostname := normalizeOptionalString(item.Hostname)
	description := normalizeOptionalString(item.Description)
	result, err := s.db.ExecContext(ctx, `
		UPDATE ipam_addresses
		SET hostname=$2, description=$3, updated_at=now(), updated_by=$4
		WHERE id=$1
	`, item.ID, hostname, description, actorID)
	if err != nil {
		return models.IPAMAddress{}, classifyIPAMWriteError(err)
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return models.IPAMAddress{}, ErrNotFound
	}
	return s.ipamAddressByID(ctx, item.ID)
}

func (s *Store) IPAMSummary(ctx context.Context) (models.IPAMSummary, error) {
	var summary models.IPAMSummary
	err := s.db.QueryRowContext(ctx, `
		SELECT
			(SELECT count(*) FROM ipam_locations),
			(SELECT count(*) FROM ipam_networks),
			(SELECT count(*) FROM ipam_subnets),
			(SELECT count(*) FROM ipam_addresses),
			(SELECT count(*) FROM ipam_addresses WHERE status='used'),
			(SELECT count(*) FROM ipam_addresses WHERE status='offline'),
			(SELECT count(*) FROM ipam_addresses WHERE status='free')
	`).Scan(
		&summary.Locations,
		&summary.Networks,
		&summary.Subnets,
		&summary.Addresses.Total,
		&summary.Addresses.Used,
		&summary.Addresses.Offline,
		&summary.Addresses.Free,
	)
	return summary, err
}

func (s *Store) ListDueIPAMSubnets(ctx context.Context, now time.Time, limit int) ([]models.IPAMSubnet, error) {
	if limit <= 0 {
		limit = 10
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT s.id, s.network_id, n.location_id, s.name, s.cidr::text, s.description,
			s.auto_discovery, s.scan_interval_seconds, s.last_scan_started_at,
			s.last_scan_completed_at, s.last_scan_status, s.last_scan_error,
			s.created_at, s.updated_at
		FROM ipam_subnets s
		JOIN ipam_networks n ON n.id = s.network_id
		WHERE s.auto_discovery = true
			AND (
				s.last_scan_started_at IS NULL
				OR (s.last_scan_status = 'running' AND s.last_scan_started_at <= $1::timestamptz - interval '15 minutes')
				OR (
					(s.last_scan_status IS NULL OR s.last_scan_status <> 'running')
					AND (
						s.last_scan_completed_at IS NULL
						OR s.last_scan_completed_at <= $1::timestamptz - (s.scan_interval_seconds * interval '1 second')
					)
				)
			)
		ORDER BY COALESCE(s.last_scan_completed_at, s.last_scan_started_at, 'epoch'::timestamptz), s.name
		LIMIT $2
	`, now.UTC(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMSubnet{}
	for rows.Next() {
		item, err := scanIPAMSubnet(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) MarkIPAMScanStarted(ctx context.Context, subnetID string, startedAt time.Time) error {
	if strings.TrimSpace(subnetID) == "" {
		return validationError("subnet id is required")
	}
	result, err := s.db.ExecContext(ctx, `
		UPDATE ipam_subnets
		SET last_scan_started_at=$2, last_scan_status='running', last_scan_error=NULL, updated_at=$2
		WHERE id=$1
			AND (last_scan_status IS DISTINCT FROM 'running' OR last_scan_started_at <= $2::timestamptz - interval '15 minutes')
	`, subnetID, startedAt.UTC())
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed > 0 {
		return nil
	}
	if _, err := s.ipamSubnetByID(ctx, subnetID); err != nil {
		return err
	}
	return fmt.Errorf("%w: subnet scan already running", ErrConflict)
}

func (s *Store) MarkIPAMScanFailed(ctx context.Context, subnetID string, completedAt time.Time, message string) (models.IPAMSubnet, error) {
	if strings.TrimSpace(subnetID) == "" {
		return models.IPAMSubnet{}, validationError("subnet id is required")
	}
	message = strings.TrimSpace(message)
	if len(message) > 500 {
		message = message[:500]
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	defer tx.Rollback()

	snapshot, err := ipamScanSubnetSnapshot(ctx, tx, subnetID)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE ipam_subnets
		SET last_scan_completed_at=$2, last_scan_status='failed', last_scan_error=$3, updated_at=$2
		WHERE id=$1
	`, subnetID, completedAt.UTC(), message)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return models.IPAMSubnet{}, ErrNotFound
	}
	if _, err := insertIPAMScanHistory(ctx, tx, ipamScanHistoryInsert{
		SubnetID:    subnetID,
		SubnetName:  snapshot.name,
		SubnetCIDR:  snapshot.cidr,
		StartedAt:   snapshot.startedAt,
		CompletedAt: completedAt.UTC(),
		Status:      models.IPAMScanHistoryFailed,
		Error:       normalizeOptionalString(&message),
	}); err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := pruneIPAMScanHistory(ctx, tx, subnetID); err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.IPAMSubnet{}, err
	}
	return s.ipamSubnetByID(ctx, subnetID)
}

func (s *Store) ListIPAMScanAddresses(ctx context.Context, subnetID string) ([]models.IPAMScanAddress, error) {
	if strings.TrimSpace(subnetID) == "" {
		return nil, validationError("subnet id is required")
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, subnet_id, address::text, status, last_seen_at, consecutive_failures
		FROM ipam_addresses
		WHERE subnet_id=$1
		ORDER BY address
	`, subnetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMScanAddress{}
	for rows.Next() {
		var item models.IPAMScanAddress
		var status string
		var lastSeenAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.SubnetID, &item.Address, &status, &lastSeenAt, &item.ConsecutiveFailures); err != nil {
			return nil, err
		}
		item.Status = models.IPAMAddressStatus(status)
		if lastSeenAt.Valid {
			seenAt := lastSeenAt.Time
			item.LastSeenAt = &seenAt
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) BulkApplyIPAMScanResults(ctx context.Context, subnetID string, completedAt time.Time, results []models.IPAMScanResult) (models.IPAMSubnet, error) {
	if strings.TrimSpace(subnetID) == "" {
		return models.IPAMSubnet{}, validationError("subnet id is required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	defer tx.Rollback()

	snapshot, err := ipamScanSubnetSnapshot(ctx, tx, subnetID)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	previous, err := ipamScanAddressSnapshots(ctx, tx, subnetID)
	if err != nil {
		return models.IPAMSubnet{}, err
	}

	stmt, err := tx.PrepareContext(ctx, `
		UPDATE ipam_addresses
		SET status=$2, last_scanned_at=$3, last_seen_at=$4,
			consecutive_failures=$5, updated_at=$6, updated_by='ipam-scanner'
		WHERE id=$1 AND subnet_id=$7
	`)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	defer stmt.Close()

	appliedAt := completedAt.UTC()
	counts := models.IPAMAddressSummary{}
	changes := make([]models.IPAMScanHistoryChange, 0)
	for _, result := range results {
		before, ok := previous[result.AddressID]
		if !ok {
			return models.IPAMSubnet{}, ErrNotFound
		}
		updateResult, err := stmt.ExecContext(ctx,
			result.AddressID,
			string(result.Status),
			result.LastScannedAt.UTC(),
			result.LastSeenAt,
			result.ConsecutiveFailures,
			appliedAt,
			subnetID,
		)
		if err != nil {
			return models.IPAMSubnet{}, err
		}
		if changed, _ := updateResult.RowsAffected(); changed == 0 {
			return models.IPAMSubnet{}, ErrNotFound
		}
		counts.Total++
		switch result.Status {
		case models.IPAMAddressUsed:
			counts.Used++
		case models.IPAMAddressOffline:
			counts.Offline++
		default:
			counts.Free++
		}
		if before.status != result.Status || (before.consecutiveFailures != result.ConsecutiveFailures && result.Status != models.IPAMAddressFree) {
			changes = append(changes, models.IPAMScanHistoryChange{
				Address:                     before.address,
				PreviousStatus:              before.status,
				CurrentStatus:               result.Status,
				PreviousLastSeenAt:          timeStringPtr(before.lastSeenAt),
				CurrentLastSeenAt:           timeStringPtr(result.LastSeenAt),
				PreviousConsecutiveFailures: before.consecutiveFailures,
				CurrentConsecutiveFailures:  result.ConsecutiveFailures,
			})
		}
	}

	updateResult, err := tx.ExecContext(ctx, `
		UPDATE ipam_subnets
		SET last_scan_completed_at=$2, last_scan_status='completed', last_scan_error=NULL, updated_at=$2
		WHERE id=$1
	`, subnetID, appliedAt)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if changed, _ := updateResult.RowsAffected(); changed == 0 {
		return models.IPAMSubnet{}, ErrNotFound
	}
	historyID, err := insertIPAMScanHistory(ctx, tx, ipamScanHistoryInsert{
		SubnetID:    subnetID,
		SubnetName:  snapshot.name,
		SubnetCIDR:  snapshot.cidr,
		StartedAt:   snapshot.startedAt,
		CompletedAt: appliedAt,
		Status:      models.IPAMScanHistoryCompleted,
		Total:       &counts.Total,
		Used:        &counts.Used,
		Offline:     &counts.Offline,
		Free:        &counts.Free,
	})
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := insertIPAMScanHistoryChanges(ctx, tx, historyID, changes); err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := pruneIPAMScanHistory(ctx, tx, subnetID); err != nil {
		return models.IPAMSubnet{}, err
	}
	if err := tx.Commit(); err != nil {
		return models.IPAMSubnet{}, err
	}
	return s.ipamSubnetByID(ctx, subnetID)
}

func (s *Store) ListIPAMScanHistory(ctx context.Context, limit int) ([]models.IPAMScanHistory, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, subnet_id, subnet_name, subnet_cidr::text, started_at, completed_at,
			status, total_count, used_count, offline_count, free_count, error
		FROM ipam_scan_history
		ORDER BY completed_at DESC, created_at DESC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []models.IPAMScanHistory{}
	for rows.Next() {
		item, err := scanIPAMScanHistory(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) IPAMScanHistoryDetail(ctx context.Context, id string) (models.IPAMScanHistoryDetail, error) {
	if strings.TrimSpace(id) == "" {
		return models.IPAMScanHistoryDetail{}, validationError("history id is required")
	}
	row := s.db.QueryRowContext(ctx, `
		SELECT id, subnet_id, subnet_name, subnet_cidr::text, started_at, completed_at,
			status, total_count, used_count, offline_count, free_count, error
		FROM ipam_scan_history
		WHERE id=$1
	`, id)
	history, err := scanIPAMScanHistory(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.IPAMScanHistoryDetail{}, ErrNotFound
	}
	if err != nil {
		return models.IPAMScanHistoryDetail{}, err
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, history_id, address::text, previous_status, current_status,
			previous_last_seen_at, current_last_seen_at,
			previous_consecutive_failures, current_consecutive_failures
		FROM ipam_scan_history_changes
		WHERE history_id=$1
		ORDER BY address
	`, id)
	if err != nil {
		return models.IPAMScanHistoryDetail{}, err
	}
	defer rows.Close()

	changes := []models.IPAMScanHistoryChange{}
	for rows.Next() {
		change, err := scanIPAMScanHistoryChange(rows)
		if err != nil {
			return models.IPAMScanHistoryDetail{}, err
		}
		changes = append(changes, change)
	}
	if err := rows.Err(); err != nil {
		return models.IPAMScanHistoryDetail{}, err
	}
	return models.IPAMScanHistoryDetail{History: history, Changes: changes}, nil
}

func (s *Store) ipamLocationByID(ctx context.Context, id string) (models.IPAMLocation, error) {
	var item models.IPAMLocation
	var createdAt, updatedAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, description, created_at, updated_at
		FROM ipam_locations
		WHERE id=$1
	`, id).Scan(&item.ID, &item.Name, &item.Description, &createdAt, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return models.IPAMLocation{}, ErrNotFound
	}
	if err != nil {
		return models.IPAMLocation{}, err
	}
	item.CreatedAt = createdAt.Format(time.RFC3339)
	item.UpdatedAt = updatedAt.Format(time.RFC3339)
	return item, nil
}

func (s *Store) ipamNetworkByID(ctx context.Context, id string) (models.IPAMNetwork, error) {
	var item models.IPAMNetwork
	var createdAt, updatedAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT id, location_id, name, description, created_at, updated_at
		FROM ipam_networks
		WHERE id=$1
	`, id).Scan(&item.ID, &item.LocationID, &item.Name, &item.Description, &createdAt, &updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return models.IPAMNetwork{}, ErrNotFound
	}
	if err != nil {
		return models.IPAMNetwork{}, err
	}
	item.CreatedAt = createdAt.Format(time.RFC3339)
	item.UpdatedAt = updatedAt.Format(time.RFC3339)
	return item, nil
}

func (s *Store) ipamSubnetByID(ctx context.Context, id string) (models.IPAMSubnet, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT s.id, s.network_id, n.location_id, s.name, s.cidr::text, s.description,
			s.auto_discovery, s.scan_interval_seconds, s.last_scan_started_at,
			s.last_scan_completed_at, s.last_scan_status, s.last_scan_error,
			s.created_at, s.updated_at
		FROM ipam_subnets s
		JOIN ipam_networks n ON n.id = s.network_id
		WHERE s.id=$1
	`, id)
	item, err := scanIPAMSubnet(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.IPAMSubnet{}, ErrNotFound
	}
	return item, err
}

func (s *Store) ipamAddressByID(ctx context.Context, id string) (models.IPAMAddress, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, subnet_id, address::text, status, hostname, description,
			last_scanned_at, last_seen_at, consecutive_failures, created_at, updated_at
		FROM ipam_addresses
		WHERE id=$1
	`, id)
	item, err := scanIPAMAddress(row)
	if errors.Is(err, sql.ErrNoRows) {
		return models.IPAMAddress{}, ErrNotFound
	}
	return item, err
}

type ipamScanSubnetSnapshotRow struct {
	name      string
	cidr      string
	startedAt *time.Time
}

func ipamScanSubnetSnapshot(ctx context.Context, tx *sql.Tx, subnetID string) (ipamScanSubnetSnapshotRow, error) {
	var snapshot ipamScanSubnetSnapshotRow
	var startedAt sql.NullTime
	err := tx.QueryRowContext(ctx, `
		SELECT name, cidr::text, last_scan_started_at
		FROM ipam_subnets
		WHERE id=$1
		FOR UPDATE
	`, subnetID).Scan(&snapshot.name, &snapshot.cidr, &startedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return ipamScanSubnetSnapshotRow{}, ErrNotFound
	}
	if err != nil {
		return ipamScanSubnetSnapshotRow{}, err
	}
	if startedAt.Valid {
		value := startedAt.Time
		snapshot.startedAt = &value
	}
	return snapshot, nil
}

type ipamScanAddressSnapshotRow struct {
	address             string
	status              models.IPAMAddressStatus
	lastSeenAt          *time.Time
	consecutiveFailures int
}

func ipamScanAddressSnapshots(ctx context.Context, tx *sql.Tx, subnetID string) (map[string]ipamScanAddressSnapshotRow, error) {
	rows, err := tx.QueryContext(ctx, `
		SELECT id, address::text, status, last_seen_at, consecutive_failures
		FROM ipam_addresses
		WHERE subnet_id=$1
		FOR UPDATE
	`, subnetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := map[string]ipamScanAddressSnapshotRow{}
	for rows.Next() {
		var id string
		var item ipamScanAddressSnapshotRow
		var status string
		var lastSeenAt sql.NullTime
		if err := rows.Scan(&id, &item.address, &status, &lastSeenAt, &item.consecutiveFailures); err != nil {
			return nil, err
		}
		item.status = models.IPAMAddressStatus(status)
		if lastSeenAt.Valid {
			value := lastSeenAt.Time
			item.lastSeenAt = &value
		}
		items[id] = item
	}
	return items, rows.Err()
}

type ipamScanHistoryInsert struct {
	SubnetID    string
	SubnetName  string
	SubnetCIDR  string
	StartedAt   *time.Time
	CompletedAt time.Time
	Status      models.IPAMScanHistoryStatus
	Total       *int
	Used        *int
	Offline     *int
	Free        *int
	Error       *string
}

func insertIPAMScanHistory(ctx context.Context, tx *sql.Tx, item ipamScanHistoryInsert) (string, error) {
	id := newID("scan")
	_, err := tx.ExecContext(ctx, `
		INSERT INTO ipam_scan_history (
			id, subnet_id, subnet_name, subnet_cidr, started_at, completed_at,
			status, total_count, used_count, offline_count, free_count, error
		)
		VALUES ($1,$2,$3,$4::cidr,$5,$6,$7,$8,$9,$10,$11,$12)
	`,
		id,
		item.SubnetID,
		item.SubnetName,
		item.SubnetCIDR,
		item.StartedAt,
		item.CompletedAt.UTC(),
		string(item.Status),
		item.Total,
		item.Used,
		item.Offline,
		item.Free,
		item.Error,
	)
	if err != nil {
		return "", err
	}
	return id, nil
}

func insertIPAMScanHistoryChanges(ctx context.Context, tx *sql.Tx, historyID string, changes []models.IPAMScanHistoryChange) error {
	if len(changes) == 0 {
		return nil
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO ipam_scan_history_changes (
			id, history_id, address, previous_status, current_status,
			previous_last_seen_at, current_last_seen_at,
			previous_consecutive_failures, current_consecutive_failures
		)
		VALUES ($1,$2,$3::inet,$4,$5,$6,$7,$8,$9)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, change := range changes {
		previousLastSeenAt, err := parseTimeStringPtr(change.PreviousLastSeenAt)
		if err != nil {
			return err
		}
		currentLastSeenAt, err := parseTimeStringPtr(change.CurrentLastSeenAt)
		if err != nil {
			return err
		}
		if _, err := stmt.ExecContext(ctx,
			newID("chg"),
			historyID,
			change.Address,
			string(change.PreviousStatus),
			string(change.CurrentStatus),
			previousLastSeenAt,
			currentLastSeenAt,
			change.PreviousConsecutiveFailures,
			change.CurrentConsecutiveFailures,
		); err != nil {
			return err
		}
	}
	return nil
}

func pruneIPAMScanHistory(ctx context.Context, tx *sql.Tx, subnetID string) error {
	_, err := tx.ExecContext(ctx, `
		DELETE FROM ipam_scan_history
		WHERE id IN (
			SELECT id
			FROM (
				SELECT id,
					row_number() OVER (
						PARTITION BY subnet_id
						ORDER BY completed_at DESC, created_at DESC
					) AS rn
				FROM ipam_scan_history
				WHERE subnet_id=$1
			) ranked
			WHERE rn > $2
		)
	`, subnetID, ipamScanHistoryRetentionPerSubnet)
	return err
}

func ipamLocationIDForNetwork(ctx context.Context, tx *sql.Tx, networkID string) (string, error) {
	var locationID string
	err := tx.QueryRowContext(ctx, `SELECT location_id FROM ipam_networks WHERE id=$1`, networkID).Scan(&locationID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return locationID, err
}

func ensureNoIPAMSubnetOverlap(ctx context.Context, tx *sql.Tx, locationID, cidr, excludeSubnetID string) error {
	var overlappingID string
	err := tx.QueryRowContext(ctx, `
		SELECT s.id
		FROM ipam_subnets s
		JOIN ipam_networks n ON n.id = s.network_id
		WHERE n.location_id=$1
			AND s.cidr && $2::cidr
			AND ($3 = '' OR s.id <> $3)
		LIMIT 1
	`, locationID, cidr, strings.TrimSpace(excludeSubnetID)).Scan(&overlappingID)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	return fmt.Errorf("%w: subnet CIDR overlaps with existing subnet %s in this location", ErrConflict, overlappingID)
}

func validateSubnetCIDR(raw string) (string, *net.IPNet, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil, validationError("cidr is required")
	}
	ip, ipNet, err := net.ParseCIDR(raw)
	if err != nil {
		return "", nil, validationError("invalid cidr")
	}
	ipv4 := ip.To4()
	if ipv4 == nil {
		return "", nil, validationError("cidr must be IPv4")
	}
	ones, bits := ipNet.Mask.Size()
	if bits != 32 {
		return "", nil, validationError("cidr must be IPv4")
	}
	if ones < 24 {
		return "", nil, validationError("cidr must be /24 or smaller")
	}
	ipNet.IP = ipNet.IP.To4()
	return ipNet.String(), ipNet, nil
}

func usableIPv4Addresses(ipNet *net.IPNet) []string {
	ones, bits := ipNet.Mask.Size()
	if bits != 32 {
		return nil
	}
	start := binary.BigEndian.Uint32(ipNet.IP.To4())
	count := uint32(1) << uint32(32-ones)
	end := start + count - 1
	if ones <= 30 {
		start++
		end--
	}
	addresses := make([]string, 0, int(end-start+1))
	for current := start; current <= end; current++ {
		ip := make(net.IP, net.IPv4len)
		binary.BigEndian.PutUint32(ip, current)
		addresses = append(addresses, ip.String())
		if current == end {
			break
		}
	}
	return addresses
}

func normalizeIPAMNameDescription(name string, description *string) (string, *string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil, validationError("name is required")
	}
	return name, normalizeOptionalString(description), nil
}

func normalizeIPAMScanInterval(interval int) (int, error) {
	if interval == 0 {
		return 3600, nil
	}
	if _, ok := allowedIPAMScanIntervals[interval]; !ok {
		return 0, validationError("scanIntervalSeconds must be one of 1800, 3600, 14400, 43200, 86400")
	}
	return interval, nil
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func formatNullTime(value sql.NullTime) *string {
	if !value.Valid {
		return nil
	}
	formatted := value.Time.Format(time.RFC3339)
	return &formatted
}

func timeStringPtr(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.Format(time.RFC3339)
	return &formatted
}

func nullIntPtr(value sql.NullInt64) *int {
	if !value.Valid {
		return nil
	}
	next := int(value.Int64)
	return &next
}

func parseTimeStringPtr(value *string) (*time.Time, error) {
	if value == nil {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, *value)
	if err != nil {
		return nil, err
	}
	parsed = parsed.UTC()
	return &parsed, nil
}

func stringFromNull(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	return &value.String
}

func classifyIPAMWriteError(err error) error {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		return err
	}
	switch pgErr.Code {
	case "23503":
		return fmt.Errorf("%w: parent IPAM resource not found", ErrNotFound)
	case "23505":
		return fmt.Errorf("%w: duplicate IPAM resource", ErrConflict)
	default:
		return err
	}
}

type ipamSubnetScanner interface {
	Scan(dest ...any) error
}

func scanIPAMSubnet(row ipamSubnetScanner) (models.IPAMSubnet, error) {
	var item models.IPAMSubnet
	var lastScanStartedAt, lastScanCompletedAt sql.NullTime
	var lastScanStatus, lastScanError sql.NullString
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&item.ID,
		&item.NetworkID,
		&item.LocationID,
		&item.Name,
		&item.CIDR,
		&item.Description,
		&item.AutoDiscovery,
		&item.ScanIntervalSeconds,
		&lastScanStartedAt,
		&lastScanCompletedAt,
		&lastScanStatus,
		&lastScanError,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return models.IPAMSubnet{}, err
	}
	item.LastScanStartedAt = formatNullTime(lastScanStartedAt)
	item.LastScanCompletedAt = formatNullTime(lastScanCompletedAt)
	item.LastScanStatus = stringFromNull(lastScanStatus)
	item.LastScanError = stringFromNull(lastScanError)
	item.CreatedAt = createdAt.Format(time.RFC3339)
	item.UpdatedAt = updatedAt.Format(time.RFC3339)
	return item, nil
}

type ipamAddressScanner interface {
	Scan(dest ...any) error
}

func scanIPAMScanHistory(row ipamSubnetScanner) (models.IPAMScanHistory, error) {
	var item models.IPAMScanHistory
	var startedAt sql.NullTime
	var completedAt time.Time
	var status string
	var total, used, offline, free sql.NullInt64
	var errorText sql.NullString
	err := row.Scan(
		&item.ID,
		&item.SubnetID,
		&item.SubnetName,
		&item.SubnetCIDR,
		&startedAt,
		&completedAt,
		&status,
		&total,
		&used,
		&offline,
		&free,
		&errorText,
	)
	if err != nil {
		return models.IPAMScanHistory{}, err
	}
	item.StartedAt = formatNullTime(startedAt)
	item.CompletedAt = completedAt.Format(time.RFC3339)
	item.Status = models.IPAMScanHistoryStatus(status)
	item.Total = nullIntPtr(total)
	item.Used = nullIntPtr(used)
	item.Offline = nullIntPtr(offline)
	item.Free = nullIntPtr(free)
	item.Error = stringFromNull(errorText)
	return item, nil
}

func scanIPAMScanHistoryChange(row ipamSubnetScanner) (models.IPAMScanHistoryChange, error) {
	var item models.IPAMScanHistoryChange
	var previousStatus, currentStatus string
	var previousLastSeenAt, currentLastSeenAt sql.NullTime
	err := row.Scan(
		&item.ID,
		&item.HistoryID,
		&item.Address,
		&previousStatus,
		&currentStatus,
		&previousLastSeenAt,
		&currentLastSeenAt,
		&item.PreviousConsecutiveFailures,
		&item.CurrentConsecutiveFailures,
	)
	if err != nil {
		return models.IPAMScanHistoryChange{}, err
	}
	item.PreviousStatus = models.IPAMAddressStatus(previousStatus)
	item.CurrentStatus = models.IPAMAddressStatus(currentStatus)
	item.PreviousLastSeenAt = formatNullTime(previousLastSeenAt)
	item.CurrentLastSeenAt = formatNullTime(currentLastSeenAt)
	return item, nil
}

func scanIPAMAddress(row ipamAddressScanner) (models.IPAMAddress, error) {
	var item models.IPAMAddress
	var status string
	var lastScannedAt, lastSeenAt sql.NullTime
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&item.ID,
		&item.SubnetID,
		&item.Address,
		&status,
		&item.Hostname,
		&item.Description,
		&lastScannedAt,
		&lastSeenAt,
		&item.ConsecutiveFailures,
		&createdAt,
		&updatedAt,
	)
	if err != nil {
		return models.IPAMAddress{}, err
	}
	item.Status = models.IPAMAddressStatus(status)
	item.LastScannedAt = formatNullTime(lastScannedAt)
	item.LastSeenAt = formatNullTime(lastSeenAt)
	item.CreatedAt = createdAt.Format(time.RFC3339)
	item.UpdatedAt = updatedAt.Format(time.RFC3339)
	return item, nil
}

func (s *Store) deleteIPAMRow(ctx context.Context, query, id string) error {
	if strings.TrimSpace(id) == "" {
		return validationError("id is required")
	}
	result, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return ErrNotFound
	}
	return nil
}
