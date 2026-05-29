import { describe, expect, it } from "vitest"

import { parseProjects, parseRepositories } from "./manage-panel"

describe("parseProjects", () => {
  it("uses a single project path with a default branch", () => {
    expect(parseProjects("sth/groupware-k8s", "main")).toEqual([
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

  it("handles multiple projects with line-by-line branch mapping", () => {
    expect(
      parseProjects("sth/proj1\nsth/proj2", "main\ndevelop")
    ).toEqual([
      {
        id: "",
        name: "sth/proj1",
        path: "sth/proj1",
        defaultBranch: "main",
        link: null,
        active: true,
      },
      {
        id: "",
        name: "sth/proj2",
        path: "sth/proj2",
        defaultBranch: "develop",
        link: null,
        active: true,
      },
    ])
  })

  it("applies a single default branch to all projects if only one branch is provided", () => {
    expect(
      parseProjects("sth/proj1\nsth/proj2", "release")
    ).toEqual([
      {
        id: "",
        name: "sth/proj1",
        path: "sth/proj1",
        defaultBranch: "release",
        link: null,
        active: true,
      },
      {
        id: "",
        name: "sth/proj2",
        path: "sth/proj2",
        defaultBranch: "release",
        link: null,
        active: true,
      },
    ])
  })
})

describe("parseRepositories", () => {
  it("uses a single repo path with a default branch", () => {
    expect(parseRepositories("sth/omni-portal", "main")).toEqual([
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

  it("handles multiple repositories with line-by-line branch mapping", () => {
    expect(
      parseRepositories("sth/repo1\nsth/repo2", "master\nmain")
    ).toEqual([
      {
        id: "",
        name: "sth/repo1",
        fullName: "sth/repo1",
        defaultBranch: "master",
        link: null,
        active: true,
      },
      {
        id: "",
        name: "sth/repo2",
        fullName: "sth/repo2",
        defaultBranch: "main",
        link: null,
        active: true,
      },
    ])
  })

  it("applies a single default branch to all repositories if only one branch is provided", () => {
    expect(
      parseRepositories("sth/repo1\nsth/repo2", "production")
    ).toEqual([
      {
        id: "",
        name: "sth/repo1",
        fullName: "sth/repo1",
        defaultBranch: "production",
        link: null,
        active: true,
      },
      {
        id: "",
        name: "sth/repo2",
        fullName: "sth/repo2",
        defaultBranch: "production",
        link: null,
        active: true,
      },
    ])
  })
})
