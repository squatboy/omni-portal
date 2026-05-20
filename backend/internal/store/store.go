package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"

	"omni-backend/internal/models"

	_ "github.com/jackc/pgx/v5/stdlib"
	"golang.org/x/crypto/bcrypt"
)

const (
	SessionCookieName = "omni_session"
	sessionTTL        = 24 * time.Hour
)

type Store struct {
	db  *sql.DB
	gcm cipher.AEAD
}

type SessionUser struct {
	models.User
}

func Open(ctx context.Context, databaseURL string, secretKey []byte) (*Store, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, err
	}

	block, err := aes.NewCipher(secretKey)
	if err != nil {
		db.Close()
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		db.Close()
		return nil, err
	}

	return &Store{db: db, gcm: gcm}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Migrate(ctx context.Context) error {
	for _, stmt := range migrations {
		if _, err := s.db.ExecContext(ctx, stmt); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) SetupRequired(ctx context.Context) (bool, error) {
	var count int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&count); err != nil {
		return false, err
	}
	return count == 0, nil
}

func (s *Store) CreateInitialAdmin(ctx context.Context, username, password string) (models.User, error) {
	required, err := s.SetupRequired(ctx)
	if err != nil {
		return models.User{}, err
	}
	if !required {
		return models.User{}, fmt.Errorf("setup already completed")
	}
	return s.CreateUser(ctx, nil, username, models.RoleAdmin, password, false)
}

func (s *Store) CreateUser(ctx context.Context, actorID *string, username string, role models.UserRole, password string, mustChange bool) (models.User, error) {
	username = strings.TrimSpace(username)
	if username == "" || password == "" {
		return models.User{}, fmt.Errorf("username and password are required")
	}
	if role != models.RoleAdmin && role != models.RoleViewer {
		return models.User{}, fmt.Errorf("role must be admin or viewer")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return models.User{}, err
	}

	id := newID("usr")
	now := time.Now().UTC()
	_, err = s.db.ExecContext(ctx, `
		INSERT INTO users (id, username, role, password_hash, must_change_password, created_at, updated_at, created_by, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$7)
	`, id, username, string(role), string(hash), mustChange, now, actorID)
	if err != nil {
		return models.User{}, err
	}
	return s.userByID(ctx, id)
}

func (s *Store) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, username, role, must_change_password, created_at, updated_at
		FROM users
		ORDER BY username
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []models.User
	for rows.Next() {
		var user models.User
		var role string
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&user.ID, &user.Username, &role, &user.MustChangePassword, &createdAt, &updatedAt); err != nil {
			return nil, err
		}
		user.Role = models.UserRole(role)
		user.CreatedAt = createdAt.Format(time.RFC3339)
		user.UpdatedAt = updatedAt.Format(time.RFC3339)
		users = append(users, user)
	}
	return users, rows.Err()
}

func (s *Store) Authenticate(ctx context.Context, username, password string) (models.User, string, error) {
	var id, passwordHash, role string
	var mustChange bool
	var failedCount int
	var lockedUntil sql.NullTime
	var createdAt, updatedAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT id, username, role, password_hash, must_change_password, failed_login_count, locked_until, created_at, updated_at
		FROM users
		WHERE username = $1
	`, strings.TrimSpace(username)).Scan(&id, &username, &role, &passwordHash, &mustChange, &failedCount, &lockedUntil, &createdAt, &updatedAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return models.User{}, "", fmt.Errorf("invalid credentials")
		}
		return models.User{}, "", err
	}
	if lockedUntil.Valid && lockedUntil.Time.After(time.Now().UTC()) {
		return models.User{}, "", fmt.Errorf("account temporarily locked")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		failedCount++
		var lock *time.Time
		if failedCount >= 5 {
			locked := time.Now().UTC().Add(10 * time.Minute)
			lock = &locked
		}
		_, _ = s.db.ExecContext(ctx, `UPDATE users SET failed_login_count=$1, locked_until=$2, updated_at=now() WHERE id=$3`, failedCount, lock, id)
		return models.User{}, "", fmt.Errorf("invalid credentials")
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET failed_login_count=0, locked_until=NULL, updated_at=now() WHERE id=$1`, id)
	if err != nil {
		return models.User{}, "", err
	}

	token, err := s.createSession(ctx, id)
	if err != nil {
		return models.User{}, "", err
	}
	return models.User{ID: id, Username: username, Role: models.UserRole(role), MustChangePassword: mustChange, CreatedAt: createdAt.Format(time.RFC3339), UpdatedAt: updatedAt.Format(time.RFC3339)}, token, nil
}

func (s *Store) UserForSession(ctx context.Context, token string) (models.User, error) {
	hash := tokenHash(token)
	return s.userBySessionHash(ctx, hash)
}

func (s *Store) RevokeSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET revoked_at=now() WHERE token_hash=$1`, tokenHash(token))
	return err
}

func (s *Store) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	var currentHash string
	if err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE id=$1`, userID).Scan(&currentHash); err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(currentHash), []byte(currentPassword)); err != nil {
		return fmt.Errorf("current password does not match")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, `UPDATE users SET password_hash=$1, must_change_password=false, updated_at=now(), updated_by=$2 WHERE id=$2`, string(hash), userID)
	return err
}

func (s *Store) ListVMResources(ctx context.Context) ([]models.VMResource, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, address, description, link, active FROM vm_resources ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.VMResource
	for rows.Next() {
		var item models.VMResource
		if err := rows.Scan(&item.ID, &item.Name, &item.Address, &item.Description, &item.Link, &item.Active); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveVMResource(ctx context.Context, actorID string, item models.VMResource) (models.VMResource, error) {
	if strings.TrimSpace(item.ID) == "" {
		item.ID = newID("vm")
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO vm_resources (id, name, address, description, link, active, created_by, updated_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
		`, item.ID, item.Name, item.Address, item.Description, item.Link, item.Active, actorID)
		if err != nil {
			return models.VMResource{}, err
		}
		return item, nil
	}
	_, err := s.db.ExecContext(ctx, `
		UPDATE vm_resources
		SET name=$2, address=$3, description=$4, link=$5, active=$6, updated_at=now(), updated_by=$7
		WHERE id=$1
	`, item.ID, item.Name, item.Address, item.Description, item.Link, item.Active, actorID)
	return item, err
}

func (s *Store) DeleteVMResource(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM vm_resources WHERE id=$1`, id)
	return err
}

func (s *Store) CollectSettings(ctx context.Context) (models.CollectSettings, error) {
	var settings models.CollectSettings

	vms, err := s.ListVMResources(ctx)
	if err != nil {
		return settings, err
	}
	for _, item := range vms {
		if item.Active {
			settings.VMs = append(settings.VMs, models.VmInventoryItem{
				ID: item.ID, Name: item.Name, Address: item.Address, Description: item.Description, Link: item.Link,
			})
		}
	}

	kubernetes, err := s.ListKubernetesIntegrations(ctx)
	if err != nil {
		return settings, err
	}
	for _, item := range kubernetes {
		if !item.Active {
			continue
		}
		token, err := s.getCredential(ctx, "kubernetes", item.ID, "bearer_token")
		if err != nil {
			continue
		}
		settings.Kubernetes = append(settings.Kubernetes, models.KubernetesCollectTarget{
			ID: item.ID, Name: item.Name, ClusterName: item.ClusterName, APIURL: item.APIURL, Token: token,
			Namespaces: item.Namespaces, AppNamespaces: item.AppNamespaces,
		})
	}

	argocd, err := s.ListArgoCDIntegrations(ctx)
	if err != nil {
		return settings, err
	}
	for _, item := range argocd {
		if !item.Active {
			continue
		}
		token, err := s.getCredential(ctx, "argocd", item.ID, "token")
		if err != nil {
			continue
		}
		settings.ArgoCD = append(settings.ArgoCD, models.ArgoCDCollectTarget{ID: item.ID, Name: item.Name, BaseURL: item.BaseURL, Token: token})
	}

	gitlab, err := s.ListGitLabIntegrations(ctx)
	if err != nil {
		return settings, err
	}
	for _, item := range gitlab {
		if !item.Active {
			continue
		}
		token, err := s.getCredential(ctx, "gitlab", item.ID, "token")
		if err != nil {
			continue
		}
		projects := make([]models.GitLabProjectTarget, 0, len(item.Projects))
		for _, project := range item.Projects {
			if project.Active {
				projects = append(projects, models.GitLabProjectTarget{
					Name: project.Name, Path: project.Path, DefaultBranch: project.DefaultBranch, Link: project.Link,
				})
			}
		}
		settings.GitLab = append(settings.GitLab, models.GitLabCollectTarget{ID: item.ID, Name: item.Name, BaseURL: item.BaseURL, Token: token, Projects: projects})
	}

	nexus, err := s.ListNexusIntegrations(ctx)
	if err != nil {
		return settings, err
	}
	for _, item := range nexus {
		if item.Active {
			settings.Nexus = append(settings.Nexus, models.NexusCollectTarget{ID: item.ID, Name: item.Name, URL: item.URL})
		}
	}
	return settings, nil
}

func (s *Store) ListKubernetesIntegrations(ctx context.Context) ([]models.KubernetesIntegration, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT k.id, k.name, k.cluster_name, k.api_url, k.namespaces, k.app_namespaces, k.active,
			EXISTS(SELECT 1 FROM integration_credentials c WHERE c.integration_type='kubernetes' AND c.integration_id=k.id AND c.secret_name='bearer_token')
		FROM kubernetes_integrations k
		ORDER BY k.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.KubernetesIntegration
	for rows.Next() {
		var item models.KubernetesIntegration
		if err := rows.Scan(&item.ID, &item.Name, &item.ClusterName, &item.APIURL, &item.Namespaces, &item.AppNamespaces, &item.Active, &item.TokenConfigured); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveKubernetesIntegration(ctx context.Context, actorID string, item models.KubernetesIntegration, token string) (models.KubernetesIntegration, error) {
	if item.ID == "" {
		item.ID = newID("k8s")
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO kubernetes_integrations (id, name, cluster_name, api_url, namespaces, app_namespaces, active, created_by, updated_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
		`, item.ID, item.Name, item.ClusterName, item.APIURL, item.Namespaces, item.AppNamespaces, item.Active, actorID)
		if err != nil {
			return models.KubernetesIntegration{}, err
		}
	} else {
		_, err := s.db.ExecContext(ctx, `
			UPDATE kubernetes_integrations
			SET name=$2, cluster_name=$3, api_url=$4, namespaces=$5, app_namespaces=$6, active=$7, updated_at=now(), updated_by=$8
			WHERE id=$1
		`, item.ID, item.Name, item.ClusterName, item.APIURL, item.Namespaces, item.AppNamespaces, item.Active, actorID)
		if err != nil {
			return models.KubernetesIntegration{}, err
		}
	}
	if strings.TrimSpace(token) != "" {
		if err := s.setCredential(ctx, "kubernetes", item.ID, "bearer_token", token); err != nil {
			return models.KubernetesIntegration{}, err
		}
		item.TokenConfigured = true
	}
	return item, nil
}

func (s *Store) ListArgoCDIntegrations(ctx context.Context) ([]models.ArgoCDIntegration, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT a.id, a.name, a.base_url, a.active,
			EXISTS(SELECT 1 FROM integration_credentials c WHERE c.integration_type='argocd' AND c.integration_id=a.id AND c.secret_name='token')
		FROM argocd_integrations a
		ORDER BY a.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.ArgoCDIntegration
	for rows.Next() {
		var item models.ArgoCDIntegration
		if err := rows.Scan(&item.ID, &item.Name, &item.BaseURL, &item.Active, &item.TokenConfigured); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveArgoCDIntegration(ctx context.Context, actorID string, item models.ArgoCDIntegration, token string) (models.ArgoCDIntegration, error) {
	if item.ID == "" {
		item.ID = newID("argo")
		_, err := s.db.ExecContext(ctx, `INSERT INTO argocd_integrations (id, name, base_url, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5)`, item.ID, item.Name, item.BaseURL, item.Active, actorID)
		if err != nil {
			return models.ArgoCDIntegration{}, err
		}
	} else {
		_, err := s.db.ExecContext(ctx, `UPDATE argocd_integrations SET name=$2, base_url=$3, active=$4, updated_at=now(), updated_by=$5 WHERE id=$1`, item.ID, item.Name, item.BaseURL, item.Active, actorID)
		if err != nil {
			return models.ArgoCDIntegration{}, err
		}
	}
	if strings.TrimSpace(token) != "" {
		if err := s.setCredential(ctx, "argocd", item.ID, "token", token); err != nil {
			return models.ArgoCDIntegration{}, err
		}
		item.TokenConfigured = true
	}
	return item, nil
}

func (s *Store) ListGitLabIntegrations(ctx context.Context) ([]models.GitLabIntegration, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT g.id, g.name, g.base_url, g.active,
			EXISTS(SELECT 1 FROM integration_credentials c WHERE c.integration_type='gitlab' AND c.integration_id=g.id AND c.secret_name='token')
		FROM gitlab_integrations g
		ORDER BY g.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.GitLabIntegration
	for rows.Next() {
		var item models.GitLabIntegration
		if err := rows.Scan(&item.ID, &item.Name, &item.BaseURL, &item.Active, &item.TokenConfigured); err != nil {
			return nil, err
		}
		projects, err := s.listGitLabProjects(ctx, item.ID)
		if err != nil {
			return nil, err
		}
		item.Projects = projects
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveGitLabIntegration(ctx context.Context, actorID string, item models.GitLabIntegration, token string) (models.GitLabIntegration, error) {
	if item.ID == "" {
		item.ID = newID("gitlab")
		_, err := s.db.ExecContext(ctx, `INSERT INTO gitlab_integrations (id, name, base_url, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5)`, item.ID, item.Name, item.BaseURL, item.Active, actorID)
		if err != nil {
			return models.GitLabIntegration{}, err
		}
	} else {
		_, err := s.db.ExecContext(ctx, `UPDATE gitlab_integrations SET name=$2, base_url=$3, active=$4, updated_at=now(), updated_by=$5 WHERE id=$1`, item.ID, item.Name, item.BaseURL, item.Active, actorID)
		if err != nil {
			return models.GitLabIntegration{}, err
		}
		_, _ = s.db.ExecContext(ctx, `DELETE FROM gitlab_projects WHERE integration_id=$1`, item.ID)
	}
	for _, project := range item.Projects {
		if project.ID == "" {
			project.ID = newID("glp")
		}
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO gitlab_projects (id, integration_id, name, path, default_branch, link, active, created_by, updated_by)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
		`, project.ID, item.ID, project.Name, project.Path, project.DefaultBranch, project.Link, project.Active, actorID)
		if err != nil {
			return models.GitLabIntegration{}, err
		}
	}
	if strings.TrimSpace(token) != "" {
		if err := s.setCredential(ctx, "gitlab", item.ID, "token", token); err != nil {
			return models.GitLabIntegration{}, err
		}
		item.TokenConfigured = true
	}
	item.Projects, _ = s.listGitLabProjects(ctx, item.ID)
	return item, nil
}

func (s *Store) ListNexusIntegrations(ctx context.Context) ([]models.NexusIntegration, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, url, active FROM nexus_integrations ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.NexusIntegration
	for rows.Next() {
		var item models.NexusIntegration
		if err := rows.Scan(&item.ID, &item.Name, &item.URL, &item.Active); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) SaveNexusIntegration(ctx context.Context, actorID string, item models.NexusIntegration) (models.NexusIntegration, error) {
	if item.ID == "" {
		item.ID = newID("nexus")
		_, err := s.db.ExecContext(ctx, `INSERT INTO nexus_integrations (id, name, url, active, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$5)`, item.ID, item.Name, item.URL, item.Active, actorID)
		return item, err
	}
	_, err := s.db.ExecContext(ctx, `UPDATE nexus_integrations SET name=$2, url=$3, active=$4, updated_at=now(), updated_by=$5 WHERE id=$1`, item.ID, item.Name, item.URL, item.Active, actorID)
	return item, err
}

func (s *Store) DeleteIntegration(ctx context.Context, table, id string) error {
	allowed := map[string]string{
		"kubernetes": "kubernetes_integrations",
		"argocd":     "argocd_integrations",
		"gitlab":     "gitlab_integrations",
		"nexus":      "nexus_integrations",
	}
	tableName, ok := allowed[table]
	if !ok {
		return fmt.Errorf("unsupported integration type")
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM `+tableName+` WHERE id=$1`, id)
	return err
}

func (s *Store) listGitLabProjects(ctx context.Context, integrationID string) ([]models.GitLabProjectItem, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, path, default_branch, link, active FROM gitlab_projects WHERE integration_id=$1 ORDER BY name`, integrationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var items []models.GitLabProjectItem
	for rows.Next() {
		var item models.GitLabProjectItem
		if err := rows.Scan(&item.ID, &item.Name, &item.Path, &item.DefaultBranch, &item.Link, &item.Active); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (s *Store) userByID(ctx context.Context, id string) (models.User, error) {
	var user models.User
	var role string
	var createdAt, updatedAt time.Time
	err := s.db.QueryRowContext(ctx, `
		SELECT id, username, role, must_change_password, created_at, updated_at
		FROM users WHERE id=$1
	`, id).Scan(&user.ID, &user.Username, &role, &user.MustChangePassword, &createdAt, &updatedAt)
	if err != nil {
		return models.User{}, err
	}
	user.Role = models.UserRole(role)
	user.CreatedAt = createdAt.Format(time.RFC3339)
	user.UpdatedAt = updatedAt.Format(time.RFC3339)
	return user, nil
}

func (s *Store) userBySessionHash(ctx context.Context, hash string) (models.User, error) {
	var userID string
	err := s.db.QueryRowContext(ctx, `
		SELECT user_id
		FROM sessions
		WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()
	`, hash).Scan(&userID)
	if err != nil {
		return models.User{}, err
	}
	return s.userByID(ctx, userID)
}

func (s *Store) createSession(ctx context.Context, userID string) (string, error) {
	raw := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (token_hash, user_id, expires_at)
		VALUES ($1,$2,$3)
	`, tokenHash(token), userID, time.Now().UTC().Add(sessionTTL))
	return token, err
}

func (s *Store) setCredential(ctx context.Context, integrationType, integrationID, secretName, value string) error {
	nonce := make([]byte, s.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	ciphertext := s.gcm.Seal(nil, nonce, []byte(value), []byte(integrationType+":"+integrationID+":"+secretName))
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO integration_credentials (integration_type, integration_id, secret_name, ciphertext, nonce, key_version, updated_at)
		VALUES ($1,$2,$3,$4,$5,1,now())
		ON CONFLICT (integration_type, integration_id, secret_name)
		DO UPDATE SET ciphertext=EXCLUDED.ciphertext, nonce=EXCLUDED.nonce, key_version=1, updated_at=now()
	`, integrationType, integrationID, secretName, ciphertext, nonce)
	return err
}

func (s *Store) getCredential(ctx context.Context, integrationType, integrationID, secretName string) (string, error) {
	var ciphertext, nonce []byte
	err := s.db.QueryRowContext(ctx, `
		SELECT ciphertext, nonce
		FROM integration_credentials
		WHERE integration_type=$1 AND integration_id=$2 AND secret_name=$3
	`, integrationType, integrationID, secretName).Scan(&ciphertext, &nonce)
	if err != nil {
		return "", err
	}
	plaintext, err := s.gcm.Open(nil, nonce, ciphertext, []byte(integrationType+":"+integrationID+":"+secretName))
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newID(prefix string) string {
	raw := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, raw); err != nil {
		panic(err)
	}
	return prefix + "_" + hex.EncodeToString(raw)
}
