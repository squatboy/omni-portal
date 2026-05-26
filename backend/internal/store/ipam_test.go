package store

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestValidateSubnetCIDR(t *testing.T) {
	tests := []struct {
		name    string
		cidr    string
		want    string
		wantErr bool
	}{
		{name: "valid /24", cidr: "192.168.10.0/24", want: "192.168.10.0/24"},
		{name: "host bits normalized", cidr: "192.168.10.15/24", want: "192.168.10.0/24"},
		{name: "valid smaller subnet", cidr: "192.168.10.0/25", want: "192.168.10.0/25"},
		{name: "reject larger than /24", cidr: "192.168.0.0/23", wantErr: true},
		{name: "reject ipv6", cidr: "2001:db8::/64", wantErr: true},
		{name: "reject invalid", cidr: "not-a-cidr", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, _, err := validateSubnetCIDR(tt.cidr)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("expected %q, got %q", tt.want, got)
			}
		})
	}
}

func TestUsableIPv4Addresses(t *testing.T) {
	tests := []struct {
		name string
		cidr string
		want []string
	}{
		{name: "excludes network and broadcast", cidr: "192.168.10.0/30", want: []string{"192.168.10.1", "192.168.10.2"}},
		{name: "includes both /31 addresses", cidr: "192.168.10.0/31", want: []string{"192.168.10.0", "192.168.10.1"}},
		{name: "includes single /32 address", cidr: "192.168.10.1/32", want: []string{"192.168.10.1"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, ipNet, err := validateSubnetCIDR(tt.cidr)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			got := usableIPv4Addresses(ipNet)
			if len(got) != len(tt.want) {
				t.Fatalf("expected %d addresses, got %d: %#v", len(tt.want), len(got), got)
			}
			for i := range tt.want {
				if got[i] != tt.want[i] {
					t.Fatalf("expected address[%d]=%q, got %q", i, tt.want[i], got[i])
				}
			}
		})
	}
}

func TestNormalizeIPAMScanInterval(t *testing.T) {
	if got, err := normalizeIPAMScanInterval(0); err != nil || got != 3600 {
		t.Fatalf("expected default 3600, got %d err=%v", got, err)
	}
	for _, interval := range []int{1800, 3600, 14400, 43200, 86400} {
		if got, err := normalizeIPAMScanInterval(interval); err != nil || got != interval {
			t.Fatalf("expected interval %d, got %d err=%v", interval, got, err)
		}
	}
	if _, err := normalizeIPAMScanInterval(60); err == nil {
		t.Fatalf("expected unsupported interval error")
	}
}

func TestValidationErrorsAreClassified(t *testing.T) {
	if _, _, err := validateSubnetCIDR("10.0.0.0/23"); !errors.Is(err, ErrValidation) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if _, _, err := normalizeIPAMNameDescription("", nil); !errors.Is(err, ErrValidation) {
		t.Fatalf("expected validation error, got %v", err)
	}
	if _, err := normalizeIPAMScanInterval(60); !errors.Is(err, ErrValidation) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestClassifyIPAMWriteError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want error
	}{
		{name: "foreign key violation maps to not found", err: &pgconn.PgError{Code: "23503"}, want: ErrNotFound},
		{name: "unique violation maps to conflict", err: &pgconn.PgError{Code: "23505"}, want: ErrConflict},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := classifyIPAMWriteError(tt.err)
			if !errors.Is(got, tt.want) {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}
