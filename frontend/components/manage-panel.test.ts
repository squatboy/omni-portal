import { describe, expect, it } from "vitest"

import { parseProjects } from "./manage-panel"

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
