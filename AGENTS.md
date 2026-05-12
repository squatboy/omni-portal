# AGENTS.md

## Scope
Working Guide & Rules for 'omni' infrastructure dashboard project

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

## Rules

Common rules and each rule when working on frontend & backend

### Do
- Always test after code fix & update
- Commit on appropriate unit after code fix
- update docs/ .md files if things changed

### Don't
- Do not git push, commit only
- Do not use obsidian vault about this project

### Frontend Rules
- Use 'shadcn' agent skill for UX/UI work.
- Use the existing installed shadcn preset

### Backend Rules

### Test Guide
- Use `npm run test` for collector/cache unit tests.
- Use `npm run typecheck` and `npm run lint` before finishing code changes.
- Collector tests should cover success, timeout, stale fallback, and one-source failure isolation.
- API routes should stay thin: start the collector if needed, then return the cached envelope only.
