# Skill Garden

> Browsable explorer for Claude Skills across the Trollefsen household.

A nightly MVP, inspired by [ConardLi/garden-skills](https://github.com/ConardLi/garden-skills) (1.2k★) — but where the upstream is a 3-skill static collection, this is a living picture of every skill across the household and how it actually gets used.

## What's different

The upstream is a beautifully-formatted static gallery. This is data-driven:

- **Filesystem scan** of all skill dirs on the VPS, deduplicated by name + inode:
  - `~/.claude/skills` (Claude Code's auto-loaded registry, visible to all agents)
  - `/home/eve/workspaces/shared/skills` (household-shared)
  - `/home/eve/workspaces/<agent>/skills` for each of Wilson, Eve, Pepper, Radar, C-3PO
- **JSONL parser** extracts real invocation data from session transcripts in `~/.claude/projects/*/`:
  - Total invocations per skill
  - Last-used timestamp
  - Who used it (per-agent breakdown)
  - Tool errors that mention a skill (proactive housekeeping signal)
- **Per-agent matrix view** — agents as columns, skills as rows. ✓ = installed in agent's own dir, · = available via shared, — = absent. Gaps visible immediately.
- **Search** across SKILL.md name + description + body content.
- **Promotion candidates** — skills used by 2+ agents but not yet promoted to shared.

## Owner tiers

- **Shared** — Both `~/.claude/skills` (Claude Code's auto-loaded registry) and `/home/eve/workspaces/shared/skills` collapse into this single tier. They're functionally equivalent: every agent's session sees them automatically.
- **Per-agent** — Skills physically located only in `/home/eve/workspaces/<agent>/skills` (not auto-loaded by other agents).

## Dedup model

Each skill is a single record keyed by lowercased name. Multiple physical locations (e.g. `wiki-search` exists in shared + all 5 agent dirs as parallel copies) merge into one entry with a `locations[]` array:

1. **Realpath dedup** — symlinks resolving to the same inode collapse first.
2. **Name dedup** — same name across different owners merges into one record. Canonical owner: `shared` if any location is shared, else first agent location.

This collapsed 41 raw filesystem entries → 24 unique skills on the latest scan.

## Invocation accuracy

JSONL invocation tracking has two paths:

1. **`Skill` tool calls** — exact match on `tool_use.input.skill`. Reliable.
2. **Bash invocations** — must contain an explicit `/skills/<name>/` anchor. (An earlier looser version matched any path containing `/<name>/`, which produced ~165 false positives for the `obsidian` skill from the `/home/eve/obsidian/` vault path. Now strict.)

Tool errors mentioning a skill are tracked separately as a housekeeping signal.

## Stack

- Next.js 15 (static export, basePath-aware)
- TypeScript, Tailwind v3
- All data extraction in `scripts/prebuild.ts` (runs at build time, writes `src/data/skills.json`)
- Zero runtime backend — fully static

## Build

```bash
npm install
npm run build         # runs prebuild → builds Next.js → exports to out/
```

Output is in `out/`. Caddy serves it via the household's `mvp.trollefsen.com` route. Note: this project uses Next.js `basePath`, so an empty `.caddy-keep-prefix` file in the project root tells the Caddyfile generator to skip URI stripping.

## Aesthetic notes

Dark terminal-flavored, monospace. Each agent has a signature color used for card borders, matrix labels, and per-agent badges:

- Wilson cyan, Eve orange, Pepper pink, Radar purple, C-3PO yellow
- Shared skills are accent green

Designed to be glanceable: at a glance you can tell which skills are heavily used, which are stale, and which agents are missing common tooling.

## Built by Nightly MVP Builder

Auto-built by Wilson on 2026-04-29 from Eve's nightly pick. Dedup + Bash false-positive fixes shipped 2026-05-01 after Daniel flagged repeated records and contradictory matrix counts.
