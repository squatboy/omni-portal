package store

var migrations = []string{
	`CREATE TABLE IF NOT EXISTS schema_migrations (
		version integer PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS users (
		id text PRIMARY KEY,
		username text NOT NULL UNIQUE,
		role text NOT NULL CHECK (role IN ('admin','viewer')),
		password_hash text NOT NULL,
		must_change_password boolean NOT NULL DEFAULT false,
		failed_login_count integer NOT NULL DEFAULT 0,
		locked_until timestamptz,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`ALTER TABLE users DROP COLUMN IF EXISTS display_name`,
	`CREATE TABLE IF NOT EXISTS sessions (
		token_hash text PRIMARY KEY,
		user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at timestamptz NOT NULL,
		revoked_at timestamptz,
		created_at timestamptz NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS vm_resources (
		id text PRIMARY KEY,
		name text NOT NULL,
		address text NOT NULL,
		description text,
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS kubernetes_integrations (
		id text PRIMARY KEY,
		name text NOT NULL,
		cluster_name text NOT NULL,
		api_url text NOT NULL,
		namespaces text[] NOT NULL DEFAULT '{}',
		app_namespaces text[] NOT NULL DEFAULT '{}',
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS gitlab_integrations (
		id text PRIMARY KEY,
		name text NOT NULL,
		base_url text NOT NULL,
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS gitlab_projects (
		id text PRIMARY KEY,
		integration_id text NOT NULL REFERENCES gitlab_integrations(id) ON DELETE CASCADE,
		name text NOT NULL,
		path text NOT NULL,
		default_branch text NOT NULL DEFAULT 'main',
		link text,
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS argocd_integrations (
		id text PRIMARY KEY,
		name text NOT NULL,
		base_url text NOT NULL,
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS nexus_integrations (
		id text PRIMARY KEY,
		name text NOT NULL,
		url text NOT NULL,
		active boolean NOT NULL DEFAULT true,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS integration_credentials (
		integration_type text NOT NULL,
		integration_id text NOT NULL,
		secret_name text NOT NULL,
		ciphertext bytea NOT NULL,
		nonce bytea NOT NULL,
		key_version integer NOT NULL DEFAULT 1,
		metadata jsonb NOT NULL DEFAULT '{}',
		updated_at timestamptz NOT NULL DEFAULT now(),
		PRIMARY KEY (integration_type, integration_id, secret_name)
	)`,
	`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)`,
	`CREATE INDEX IF NOT EXISTS gitlab_projects_integration_id_idx ON gitlab_projects(integration_id)`,
	`ALTER TABLE kubernetes_integrations DROP COLUMN IF EXISTS cluster_name`,
	`ALTER TABLE kubernetes_integrations DROP COLUMN IF EXISTS app_namespaces`,
	`CREATE TABLE IF NOT EXISTS ipam_locations (
		id text PRIMARY KEY,
		name text NOT NULL UNIQUE,
		description text,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`CREATE TABLE IF NOT EXISTS ipam_networks (
		id text PRIMARY KEY,
		location_id text NOT NULL REFERENCES ipam_locations(id) ON DELETE CASCADE,
		name text NOT NULL,
		description text,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text,
		UNIQUE (location_id, name)
	)`,
	`CREATE TABLE IF NOT EXISTS ipam_subnets (
		id text PRIMARY KEY,
		network_id text NOT NULL REFERENCES ipam_networks(id) ON DELETE CASCADE,
		name text NOT NULL,
		cidr cidr NOT NULL,
		description text,
		auto_discovery boolean NOT NULL DEFAULT false,
		scan_interval_seconds integer NOT NULL DEFAULT 3600 CHECK (scan_interval_seconds IN (1800, 3600, 14400, 43200, 86400)),
		last_scan_started_at timestamptz,
		last_scan_completed_at timestamptz,
		last_scan_status text,
		last_scan_error text,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text
	)`,
	`DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint WHERE conname = 'ipam_subnets_cidr_ipv4_check'
		) THEN
			ALTER TABLE ipam_subnets
			ADD CONSTRAINT ipam_subnets_cidr_ipv4_check CHECK (family(cidr) = 4);
		END IF;
	END $$`,
	`DO $$
	BEGIN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint WHERE conname = 'ipam_subnets_cidr_masklen_check'
		) THEN
			ALTER TABLE ipam_subnets
			ADD CONSTRAINT ipam_subnets_cidr_masklen_check CHECK (masklen(cidr) >= 24);
		END IF;
	END $$`,
	`CREATE TABLE IF NOT EXISTS ipam_addresses (
		id text PRIMARY KEY,
		subnet_id text NOT NULL REFERENCES ipam_subnets(id) ON DELETE CASCADE,
		address inet NOT NULL,
		status text NOT NULL DEFAULT 'free' CHECK (status IN ('used','offline','free')),
		hostname text,
		description text,
		last_scanned_at timestamptz,
		last_seen_at timestamptz,
		consecutive_failures integer NOT NULL DEFAULT 0,
		created_at timestamptz NOT NULL DEFAULT now(),
		updated_at timestamptz NOT NULL DEFAULT now(),
		created_by text,
		updated_by text,
		UNIQUE (subnet_id, address)
	)`,
	`CREATE TABLE IF NOT EXISTS ipam_scan_history (
		id text PRIMARY KEY,
		subnet_id text NOT NULL REFERENCES ipam_subnets(id) ON DELETE CASCADE,
		subnet_name text NOT NULL,
		subnet_cidr cidr NOT NULL,
		started_at timestamptz,
		completed_at timestamptz NOT NULL,
		status text NOT NULL CHECK (status IN ('completed','failed')),
		total_count integer,
		used_count integer,
		offline_count integer,
		free_count integer,
		error text,
		created_at timestamptz NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS ipam_scan_history_changes (
		id text PRIMARY KEY,
		history_id text NOT NULL REFERENCES ipam_scan_history(id) ON DELETE CASCADE,
		address inet NOT NULL,
		previous_status text NOT NULL CHECK (previous_status IN ('used','offline','free')),
		current_status text NOT NULL CHECK (current_status IN ('used','offline','free')),
		previous_last_seen_at timestamptz,
		current_last_seen_at timestamptz,
		previous_consecutive_failures integer NOT NULL,
		current_consecutive_failures integer NOT NULL,
		created_at timestamptz NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS ipam_networks_location_id_idx ON ipam_networks(location_id)`,
	`CREATE INDEX IF NOT EXISTS ipam_subnets_network_id_idx ON ipam_subnets(network_id)`,
	`CREATE INDEX IF NOT EXISTS ipam_subnets_cidr_idx ON ipam_subnets(cidr)`,
	`CREATE INDEX IF NOT EXISTS ipam_addresses_subnet_id_idx ON ipam_addresses(subnet_id)`,
	`CREATE INDEX IF NOT EXISTS ipam_scan_history_subnet_completed_idx ON ipam_scan_history(subnet_id, completed_at DESC)`,
	`CREATE INDEX IF NOT EXISTS ipam_scan_history_completed_idx ON ipam_scan_history(completed_at DESC)`,
	`CREATE INDEX IF NOT EXISTS ipam_scan_history_changes_history_id_idx ON ipam_scan_history_changes(history_id)`,
	`DO $$
	BEGIN
		IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = 1) THEN
			ALTER TABLE ipam_addresses DROP CONSTRAINT IF EXISTS ipam_addresses_status_check;
			
			UPDATE ipam_addresses
			SET status = CASE
				WHEN status = 'active' THEN 'used'
				WHEN status = 'dead' THEN 'offline'
				WHEN status = 'offline' THEN 'free'
				ELSE status
			END;
			
			ALTER TABLE ipam_addresses ALTER COLUMN status SET DEFAULT 'free';
			ALTER TABLE ipam_addresses ADD CONSTRAINT ipam_addresses_status_check CHECK (status IN ('used', 'offline', 'free'));
			
			INSERT INTO schema_migrations (version) VALUES (1);
		END IF;
	END $$`,
}
