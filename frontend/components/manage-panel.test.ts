import { describe, expect, it } from "vitest"

import { parseProjects, parseRepositories } from "./manage-panel"

describe("parseProjects", () => {
  it("uses a single project path as both name and path", () => {
    expect(parseProjects("sth/groupware-k8s")).toEqual([
      {
        id: "",
        name: "sth/groupware-k8s",
        path: "sth/groupware-k8s",
        defaultBranch: "main",
        link: null,
        active: true,
      },
    ])
  })

  it("keeps the explicit name, path, branch, and link format", () => {
    expect(
      parseProjects(
        "Groupware K8s|sth/groupware-k8s|main|https://gitlab.sthcompany.com/sth/groupware-k8s"
      )
    ).toEqual([
      {
        id: "",
        name: "Groupware K8s",
        path: "sth/groupware-k8s",
        defaultBranch: "main",
        link: "https://gitlab.sthcompany.com/sth/groupware-k8s",
        active: true,
      },
    ])
  })
})

describe("parseRepositories", () => {
  it("uses a single owner/repo value as both name and full name", () => {
    expect(parseRepositories("sth/omni-portal")).toEqual([
      {
        id: "",
        name: "sth/omni-portal",
        fullName: "sth/omni-portal",
        defaultBranch: "main",
        link: null,
        active: true,
      },
    ])
  })

  it("keeps the explicit name, owner/repo, branch, and link format", () => {
    expect(
      parseRepositories(
        "Omni Portal|sth/omni-portal|main|https://github.com/sth/omni-portal"
      )
    ).toEqual([
      {
        id: "",
        name: "Omni Portal",
        fullName: "sth/omni-portal",
        defaultBranch: "main",
        link: "https://github.com/sth/omni-portal",
        active: true,
      },
    ])
  })
})
