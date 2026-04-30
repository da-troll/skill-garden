/**
 * Prebuild: walks all known skill dirs, deduplicates by skill name + inode,
 * merges multi-location occurrences into single records, scans JSONL session
 * transcripts for invocations, and writes src/data/skills.json.
 *
 * Owner tiers:
 *   - 'shared': either ~/.claude/skills (Claude Code's auto-loaded skill registry,
 *     visible to ALL agents) or /home/eve/workspaces/shared/skills (household-shared).
 *     Both are functionally equivalent — available everywhere — and are merged
 *     into one tier here.
 *   - <agentId>: per-agent dirs (/home/eve/workspaces/<agent>/skills).
 *
 * Dedup order (per skill name, lowercased):
 *   1. realpath dedup — different paths resolving to the same inode collapse.
 *   2. name dedup — same name in different owners merges into one record with
 *      a `locations[]` array. Canonical owner: 'shared' if any location is
 *      shared, else first agent location encountered.
 *
 * Output: src/data/skills.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const HOME = os.homedir();

const AGENTS = [
  { id: 'wilson', label: 'Wilson', color: 'wilson' },
  { id: 'eve',    label: 'Eve',    color: 'eve' },
  { id: 'pepper', label: 'Pepper', color: 'pepper' },
  { id: 'radar',  label: 'Radar',  color: 'radar' },
  { id: 'c3po',   label: 'C-3PO',  color: 'c3po' },
] as const;

type AgentId = typeof AGENTS[number]['id'];
type Owner = AgentId | 'shared';

interface Location {
  owner: Owner;
  ownerLabel: string;
  path: string;        // path to SKILL.md as found (pre-realpath)
  realpath: string;    // resolved inode-canonical path
}

interface Skill {
  id: string;             // lowercased name (canonical)
  name: string;
  canonicalOwner: Owner;
  ownerLabel: string;
  // Backward-compat alias for components that still read skill.owner
  owner: Owner;
  description: string;
  body: string;
  path: string;
  locations: Location[];
  isPromotionCandidate: boolean;
  invocations: number;
  lastInvokedAt: string | null;
  invokedBy: Record<string, number>;
  errors: number;
}

const SKILL_DIRS: { dir: string; owner: Owner; ownerLabel: string }[] = [
  { dir: path.join(HOME, '.claude/skills'),         owner: 'shared', ownerLabel: 'Shared' },
  { dir: '/home/eve/workspaces/shared/skills',      owner: 'shared', ownerLabel: 'Shared' },
  ...AGENTS.map((a) => ({
    dir: `/home/eve/workspaces/${a.id}/skills`,
    owner: a.id as Owner,
    ownerLabel: a.label,
  })),
];

function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (k) fm[k] = v;
  }
  return { fm, body: m[2] };
}

interface RawHit {
  name: string;
  description: string;
  body: string;
  location: Location;
}

function collectFromDir(dir: string, owner: Owner, ownerLabel: string): RawHit[] {
  if (!fs.existsSync(dir)) return [];
  const out: RawHit[] = [];
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  for (const ent of entries) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
    const skillDir = path.join(dir, ent.name);
    let stat: fs.Stats;
    try { stat = fs.statSync(skillDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    let realpath = skillFile;
    try { realpath = fs.realpathSync(skillFile); } catch { /* keep raw */ }
    let raw = '';
    try { raw = fs.readFileSync(skillFile, 'utf8'); } catch { continue; }
    const { fm, body } = parseFrontmatter(raw);
    const name = fm.name || ent.name;
    const description = (fm.description || fm.summary || '').slice(0, 400);
    out.push({
      name,
      description,
      body: body.slice(0, 50_000),
      location: { owner, ownerLabel, path: skillFile, realpath },
    });
  }
  return out;
}

function pickCanonicalOwner(locations: Location[]): { owner: Owner; ownerLabel: string } {
  // Prefer 'shared' if present, else the first agent location encountered.
  const shared = locations.find((l) => l.owner === 'shared');
  if (shared) return { owner: 'shared', ownerLabel: 'Shared' };
  const first = locations[0];
  return { owner: first.owner, ownerLabel: first.ownerLabel };
}

function mergeHitsToSkills(hits: RawHit[]): Skill[] {
  const byName = new Map<string, RawHit[]>();
  for (const h of hits) {
    const key = h.name.toLowerCase();
    const arr = byName.get(key);
    if (arr) arr.push(h);
    else byName.set(key, [h]);
  }

  const skills: Skill[] = [];
  for (const [key, group] of byName) {
    const seenReal = new Set<string>();
    const locations: Location[] = [];
    let bestDescription = '';
    let bestBody = '';
    const bestName = group[0].name;
    for (const h of group) {
      if (seenReal.has(h.location.realpath)) continue;
      seenReal.add(h.location.realpath);
      locations.push(h.location);
      if (!bestDescription && h.description) bestDescription = h.description;
      if (!bestBody && h.body) bestBody = h.body;
    }

    const { owner: canonicalOwner, ownerLabel } = pickCanonicalOwner(locations);
    const canonical = locations.find((l) => l.owner === canonicalOwner) || locations[0];

    const agentLocCount = locations.filter((l) => l.owner !== 'shared').length;
    const inShared = locations.some((l) => l.owner === 'shared');
    const isPromotionCandidate = agentLocCount >= 3 && !inShared;

    skills.push({
      id: key,
      name: bestName,
      canonicalOwner,
      owner: canonicalOwner,
      ownerLabel,
      description: bestDescription,
      body: bestBody,
      path: canonical.realpath,
      locations,
      isPromotionCandidate,
      invocations: 0,
      lastInvokedAt: null,
      invokedBy: {},
      errors: 0,
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

function scanSessionsForUsage(skills: Skill[]) {
  const byName = new Map<string, Skill>();
  for (const s of skills) byName.set(s.name.toLowerCase(), s);
  if (byName.size === 0) return;

  const projectsDir = path.join(HOME, '.claude/projects');
  if (!fs.existsSync(projectsDir)) return;

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(projectsDir, d.name));

  for (const pdir of projectDirs) {
    const agentId = AGENTS.find((a) => pdir.endsWith(`-${a.id}`))?.id || 'unknown';

    let files: string[] = [];
    try { files = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }

    const sortedFiles = files
      .map((f) => ({ f, mtime: fs.statSync(path.join(pdir, f)).mtime.getTime() }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 50)
      .map((x) => x.f);

    for (const file of sortedFiles) {
      const fullPath = path.join(pdir, file);
      let content = '';
      try { content = fs.readFileSync(fullPath, 'utf8'); } catch { continue; }

      for (const line of content.split('\n')) {
        if (!line || line.length > 200_000) continue;
        let evt: any;
        try { evt = JSON.parse(line); } catch { continue; }
        if (!evt) continue;

        const ts = evt.timestamp || evt.created_at || evt.message?.created_at || null;
        const toolUses = collectToolUses(evt);
        for (const tu of toolUses) {
          const name = tu.name || '';
          if (name === 'Skill' || name === 'skill') {
            const skillName: string = (tu.input?.skill || tu.input?.name || '').toLowerCase();
            if (!skillName) continue;
            const s = byName.get(skillName);
            if (!s) continue;
            s.invocations++;
            s.invokedBy[agentId] = (s.invokedBy[agentId] || 0) + 1;
            if (ts && (!s.lastInvokedAt || ts > s.lastInvokedAt)) s.lastInvokedAt = ts;
          }
          if (name === 'Bash' && tu.input?.command) {
            const cmd: string = tu.input.command;
            const cmdLower = cmd.toLowerCase();
            for (const [lname, s] of byName.entries()) {
              if (cmdLower.includes(`/${lname}/`) || cmdLower.includes(`skills/${lname}`)) {
                s.invocations++;
                s.invokedBy[agentId] = (s.invokedBy[agentId] || 0) + 1;
                if (ts && (!s.lastInvokedAt || ts > s.lastInvokedAt)) s.lastInvokedAt = ts;
              }
            }
          }
        }

        const errText = JSON.stringify(evt.error || evt.message?.error || '');
        if (errText && errText.length < 5000) {
          const errLower = errText.toLowerCase();
          for (const [lname, s] of byName.entries()) {
            if (errLower.includes(`skill ${lname}`) || errLower.includes(`skill: ${lname}`)) {
              s.errors++;
            }
          }
        }
      }
    }
  }
}

function collectToolUses(evt: any, acc: any[] = []): any[] {
  if (!evt || typeof evt !== 'object') return acc;
  if (evt.type === 'tool_use' && evt.name) acc.push(evt);
  if (Array.isArray(evt.content)) for (const c of evt.content) collectToolUses(c, acc);
  if (evt.message) collectToolUses(evt.message, acc);
  return acc;
}

function buildMatrix(skills: Skill[]) {
  const matrix: Record<string, Record<string, 'own' | 'shared' | 'absent'>> = {};
  for (const s of skills) {
    const inShared = s.locations.some((l) => l.owner === 'shared');
    const ownersWithDir = new Set(s.locations.map((l) => l.owner));
    matrix[s.name] = {};
    for (const a of AGENTS) {
      if (ownersWithDir.has(a.id)) matrix[s.name][a.id] = 'own';
      else if (inShared) matrix[s.name][a.id] = 'shared';
      else matrix[s.name][a.id] = 'absent';
    }
  }
  return matrix;
}

function main() {
  const allHits: RawHit[] = [];
  for (const { dir, owner, ownerLabel } of SKILL_DIRS) {
    allHits.push(...collectFromDir(dir, owner, ownerLabel));
  }
  console.log(`[prebuild] collected ${allHits.length} raw entries from ${SKILL_DIRS.length} dirs`);

  const skills = mergeHitsToSkills(allHits);
  console.log(`[prebuild] merged into ${skills.length} unique skills`);

  scanSessionsForUsage(skills);
  const totalInvocations = skills.reduce((n, s) => n + s.invocations, 0);
  console.log(`[prebuild] usage scan complete — ${totalInvocations} invocations recorded`);

  const matrix = buildMatrix(skills);

  const promotionCandidates = skills.filter((s) => s.isPromotionCandidate).map((s) => s.name);
  if (promotionCandidates.length > 0) {
    console.log(`[prebuild] promotion candidates (3+ agent dirs, not shared): ${promotionCandidates.join(', ')}`);
  }

  const out = {
    generated_at: new Date().toISOString(),
    agents: AGENTS,
    skills,
    matrix,
    promotion_candidates: promotionCandidates,
    totals: {
      skill_count: skills.length,
      invocation_count: totalInvocations,
      shared_count: skills.filter((s) => s.canonicalOwner === 'shared').length,
      agent_owned_count: skills.filter((s) => s.canonicalOwner !== 'shared').length,
      promotion_candidate_count: promotionCandidates.length,
    },
  };
  const outPath = path.join(__dirname, '..', 'src/data/skills.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[prebuild] wrote ${outPath}`);
}

main();
