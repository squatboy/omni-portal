export const testEnv = {
  nexusUrl: process.env.TEST_NEXUS_URL ?? "https://nexus.example.internal",
  gitlabBaseUrl:
    process.env.TEST_GITLAB_BASE_URL ?? "https://gitlab.example.internal",
  argocdBaseUrl:
    process.env.TEST_ARGOCD_BASE_URL ?? "https://argocd.example.internal",
  omniHost: process.env.TEST_OMNI_HOST ?? "omni.example.internal",
  groupwareWebHost:
    process.env.TEST_GROUPWARE_WEB_HOST ?? "groupware.example.internal",
  groupwareApiHost:
    process.env.TEST_GROUPWARE_API_HOST ?? "api.groupware.example.internal",
}
