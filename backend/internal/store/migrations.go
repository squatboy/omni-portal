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
		link text,
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
}
