package api

import (
	"net/http"
	"strings"
	"time"

	"omni-backend/internal/collector"
	"omni-backend/internal/config"
	"omni-backend/internal/models"
	"omni-backend/internal/store"

	"github.com/gin-gonic/gin"
)

type API struct {
	cache  *collector.Cache
	runner *collector.Runner
	store  *store.Store
	config *config.AppConfig
}

type authedUserKey struct{}

func SetupRouter(cache *collector.Cache, runner *collector.Runner, st *store.Store, cfg *config.AppConfig) *gin.Engine {
	api := &API{cache: cache, runner: runner, store: st, config: cfg}
	r := gin.Default()

	auth := r.Group("/api/auth")
	{
		auth.GET("/me", api.handleMe)
		auth.POST("/setup", api.handleSetup)
		auth.POST("/login", api.handleLogin)
		auth.POST("/logout", api.requireAuth(api.handleLogout))
		auth.POST("/password", api.requireAuth(api.handlePasswordChange))
	}

	collect := r.Group("/api/collect")
	collect.Use(api.requireAuthMiddleware())
	{
		collect.GET("/snapshot", func(c *gin.Context) {
			if c.Query("force") == "true" && runner != nil {
				runner.CollectOnce(c.Request.Context())
			}
			c.JSON(http.StatusOK, cache.GetSnapshot())
		})
		collect.GET("/vms", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetVMs()) })
		collect.GET("/kubernetes", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetKubernetes()) })
		collect.GET("/argocd", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetArgoCD()) })
		collect.GET("/gitlab", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetGitLab()) })
		collect.GET("/nexus", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetNexus()) })
		collect.GET("/overview", func(c *gin.Context) { c.JSON(http.StatusOK, cache.GetOverview()) })
	}

	manage := r.Group("/api/manage")
	manage.Use(api.requireAdmin())
	{
		manage.GET("/resources/vms", api.handleListVMs)
		manage.POST("/resources/vms", api.handleSaveVM)
		manage.DELETE("/resources/vms/:id", api.handleDeleteVM)

		manage.GET("/integrations/kubernetes", api.handleListKubernetes)
		manage.POST("/integrations/kubernetes", api.handleSaveKubernetes)
		manage.DELETE("/integrations/kubernetes/:id", api.handleDeleteKubernetes)
		manage.POST("/integrations/kubernetes/test", api.handleTestKubernetes)

		manage.GET("/integrations/argocd", api.handleListArgoCD)
		manage.POST("/integrations/argocd", api.handleSaveArgoCD)
		manage.DELETE("/integrations/argocd/:id", api.handleDeleteArgoCD)
		manage.POST("/integrations/argocd/test", api.handleTestArgoCD)

		manage.GET("/integrations/gitlab", api.handleListGitLab)
		manage.POST("/integrations/gitlab", api.handleSaveGitLab)
		manage.DELETE("/integrations/gitlab/:id", api.handleDeleteGitLab)
		manage.POST("/integrations/gitlab/test", api.handleTestGitLab)

		manage.GET("/integrations/nexus", api.handleListNexus)
		manage.POST("/integrations/nexus", api.handleSaveNexus)
		manage.DELETE("/integrations/nexus/:id", api.handleDeleteNexus)
		manage.POST("/integrations/nexus/test", api.handleTestNexus)

		manage.GET("/users", api.handleListUsers)
		manage.POST("/users", api.handleCreateUser)
	}

	r.GET("/health/ready", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return r
}

func (api *API) handleMe(c *gin.Context) {
	setupRequired, _ := api.store.SetupRequired(c.Request.Context())
	user, ok := api.currentUser(c)
	if !ok {
		c.JSON(http.StatusOK, gin.H{"authenticated": false, "setupRequired": setupRequired})
		return
	}
	c.JSON(http.StatusOK, gin.H{"authenticated": true, "setupRequired": setupRequired, "user": user})
}

func (api *API) handleSetup(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !bindJSON(c, &req) {
		return
	}
	user, err := api.store.CreateInitialAdmin(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"user": user})
}

func (api *API) handleLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !bindJSON(c, &req) {
		return
	}
	user, token, err := api.store.Authenticate(c.Request.Context(), req.Username, req.Password)
	if err != nil {
		writeError(c, http.StatusUnauthorized, err)
		return
	}
	setSessionCookie(c, token)
	c.JSON(http.StatusOK, gin.H{"user": user})
}

func (api *API) handleLogout(c *gin.Context) {
	token, _ := c.Cookie(store.SessionCookieName)
	_ = api.store.RevokeSession(c.Request.Context(), token)
	clearSessionCookie(c)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (api *API) handlePasswordChange(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	if !bindJSON(c, &req) {
		return
	}
	if err := api.store.ChangePassword(c.Request.Context(), user.ID, req.CurrentPassword, req.NewPassword); err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (api *API) handleListVMs(c *gin.Context) {
	items, err := api.store.ListVMResources(c.Request.Context())
	writeJSON(c, items, err)
}

func (api *API) handleSaveVM(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req models.VMResource
	if !bindJSON(c, &req) {
		return
	}
	item, err := api.store.SaveVMResource(c.Request.Context(), user.ID, req)
	writeJSON(c, item, err)
}

func (api *API) handleDeleteVM(c *gin.Context) {
	writeJSON(c, gin.H{"ok": true}, api.store.DeleteVMResource(c.Request.Context(), c.Param("id")))
}

func (api *API) handleListKubernetes(c *gin.Context) {
	items, err := api.store.ListKubernetesIntegrations(c.Request.Context())
	writeJSON(c, items, err)
}

func (api *API) handleSaveKubernetes(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req struct {
		models.KubernetesIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	item, err := api.store.SaveKubernetesIntegration(c.Request.Context(), user.ID, req.KubernetesIntegration, req.Token)
	writeJSON(c, item, err)
}

func (api *API) handleDeleteKubernetes(c *gin.Context) {
	writeJSON(c, gin.H{"ok": true}, api.store.DeleteIntegration(c.Request.Context(), "kubernetes", c.Param("id")))
}

func (api *API) handleTestKubernetes(c *gin.Context) {
	var req struct {
		models.KubernetesIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	result := collector.CollectKubernetes(c.Request.Context(), []models.KubernetesCollectTarget{{
		ID: req.ID, Name: req.Name, ClusterName: req.ClusterName, APIURL: req.APIURL, Token: req.Token,
		Namespaces: req.Namespaces, AppNamespaces: req.AppNamespaces,
	}})
	writeTestResult(c, result.Status, result.Error)
}

func (api *API) handleListArgoCD(c *gin.Context) {
	items, err := api.store.ListArgoCDIntegrations(c.Request.Context())
	writeJSON(c, items, err)
}

func (api *API) handleSaveArgoCD(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req struct {
		models.ArgoCDIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	item, err := api.store.SaveArgoCDIntegration(c.Request.Context(), user.ID, req.ArgoCDIntegration, req.Token)
	writeJSON(c, item, err)
}

func (api *API) handleDeleteArgoCD(c *gin.Context) {
	writeJSON(c, gin.H{"ok": true}, api.store.DeleteIntegration(c.Request.Context(), "argocd", c.Param("id")))
}

func (api *API) handleTestArgoCD(c *gin.Context) {
	var req struct {
		models.ArgoCDIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	result := collector.CollectArgoCD(c.Request.Context(), []models.ArgoCDCollectTarget{{ID: req.ID, Name: req.Name, BaseURL: req.BaseURL, Token: req.Token}})
	writeTestResult(c, result.Status, result.Error)
}

func (api *API) handleListGitLab(c *gin.Context) {
	items, err := api.store.ListGitLabIntegrations(c.Request.Context())
	writeJSON(c, items, err)
}

func (api *API) handleSaveGitLab(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req struct {
		models.GitLabIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	item, err := api.store.SaveGitLabIntegration(c.Request.Context(), user.ID, req.GitLabIntegration, req.Token)
	writeJSON(c, item, err)
}

func (api *API) handleDeleteGitLab(c *gin.Context) {
	writeJSON(c, gin.H{"ok": true}, api.store.DeleteIntegration(c.Request.Context(), "gitlab", c.Param("id")))
}

func (api *API) handleTestGitLab(c *gin.Context) {
	var req struct {
		models.GitLabIntegration
		Token string `json:"token"`
	}
	if !bindJSON(c, &req) {
		return
	}
	projects := make([]models.GitLabProjectTarget, 0, len(req.Projects))
	for _, project := range req.Projects {
		projects = append(projects, models.GitLabProjectTarget{Name: project.Name, Path: project.Path, DefaultBranch: project.DefaultBranch, Link: project.Link})
	}
	result := collector.CollectGitLab(c.Request.Context(), []models.GitLabCollectTarget{{ID: req.ID, Name: req.Name, BaseURL: req.BaseURL, Token: req.Token, Projects: projects}})
	writeTestResult(c, result.Status, result.Error)
}

func (api *API) handleListNexus(c *gin.Context) {
	items, err := api.store.ListNexusIntegrations(c.Request.Context())
	writeJSON(c, items, err)
}

func (api *API) handleSaveNexus(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req models.NexusIntegration
	if !bindJSON(c, &req) {
		return
	}
	item, err := api.store.SaveNexusIntegration(c.Request.Context(), user.ID, req)
	writeJSON(c, item, err)
}

func (api *API) handleDeleteNexus(c *gin.Context) {
	writeJSON(c, gin.H{"ok": true}, api.store.DeleteIntegration(c.Request.Context(), "nexus", c.Param("id")))
}

func (api *API) handleTestNexus(c *gin.Context) {
	var req models.NexusIntegration
	if !bindJSON(c, &req) {
		return
	}
	result := collector.CollectNexus(c.Request.Context(), []models.NexusCollectTarget{{ID: req.ID, Name: req.Name, URL: req.URL}})
	writeTestResult(c, result.Status, result.Error)
}

func (api *API) handleListUsers(c *gin.Context) {
	users, err := api.store.ListUsers(c.Request.Context())
	writeJSON(c, users, err)
}

func (api *API) handleCreateUser(c *gin.Context) {
	user, _ := api.currentUser(c)
	var req struct {
		Username           string          `json:"username"`
		Role               models.UserRole `json:"role"`
		Password           string          `json:"password"`
		MustChangePassword bool            `json:"mustChangePassword"`
	}
	if !bindJSON(c, &req) {
		return
	}
	created, err := api.store.CreateUser(c.Request.Context(), &user.ID, req.Username, req.Role, req.Password, req.MustChangePassword)
	writeJSON(c, created, err)
}

func (api *API) optionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		api.loadSession(c)
		c.Next()
	}
}

func (api *API) requireAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if api.store == nil {
			c.Next()
			return
		}
		if _, ok := api.loadSession(c); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		c.Next()
	}
}

func (api *API) requireAuth(next gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if _, ok := api.loadSession(c); !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		next(c)
	}
}

func (api *API) requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		user, ok := api.loadSession(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authentication required"})
			return
		}
		if user.Role != models.RoleAdmin {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "admin role required"})
			return
		}
		c.Next()
	}
}

func (api *API) loadSession(c *gin.Context) (models.User, bool) {
	if api.store == nil {
		return models.User{}, false
	}
	if existing, ok := c.Get("user"); ok {
		user, _ := existing.(models.User)
		return user, true
	}
	token, err := c.Cookie(store.SessionCookieName)
	if err != nil || strings.TrimSpace(token) == "" {
		return models.User{}, false
	}
	user, err := api.store.UserForSession(c.Request.Context(), token)
	if err != nil {
		return models.User{}, false
	}
	c.Set("user", user)
	return user, true
}

func (api *API) currentUser(c *gin.Context) (models.User, bool) {
	value, ok := c.Get("user")
	if !ok {
		return api.loadSession(c)
	}
	user, ok := value.(models.User)
	return user, ok
}

func bindJSON(c *gin.Context, dest any) bool {
	if err := c.ShouldBindJSON(dest); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return false
	}
	return true
}

func writeJSON(c *gin.Context, payload any, err error) {
	if err != nil {
		writeError(c, http.StatusBadRequest, err)
		return
	}
	c.JSON(http.StatusOK, payload)
}

func writeError(c *gin.Context, status int, err error) {
	c.JSON(status, gin.H{"error": err.Error()})
}

func writeTestResult(c *gin.Context, status models.SourceStatus, collectErr *models.CollectError) {
	ok := status == models.StatusOk || status == models.StatusProgressing || status == models.StatusStale
	c.JSON(http.StatusOK, gin.H{"ok": ok, "status": status, "error": collectErr})
}

func setSessionCookie(c *gin.Context, token string) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     store.SessionCookieName,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(24 * time.Hour),
		MaxAge:   int((24 * time.Hour).Seconds()),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     store.SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}
