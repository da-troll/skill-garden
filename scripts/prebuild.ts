/**
 * Prebuild: walks all known skill dirs, extracts SKILL.md content + frontmatter,
 * scans JSONL session transcripts for skill invocations, writes a single JSON
 * blob to src/data/skills.json that the static UI imports at build time.
 *
 * Data sources:
 *   - User skills:   ~/.claude/skills
 *   - Shared skills: /home/eve/workspaces/shared/skills
 *   - Per-agent:     /home/eve/workspaces/<agent>/skills (if exists)
 *   - Sessions:      /home/eve/.claude/projects/-*-<agent>-* / *.jsonl
 *
 * Output: src/data/skills.json
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const HOME = os.homedir();

const AGENTS = [
  { id: 'wilson', label: 'Wilson', color: 'wilson' },
  { id: 'eve', label: 'Eve', color: 'eve' },
  { id: 'pepper', label: 'Pepper', color: 'pepper' },
  { id: 'radar', label: 'Radar', color: 'radar' },
  { id: 'c3po', label: 'C-3PO', color: 'c3po' },
] as const;

type Owner = typeof AGENTS[number]['id'] | 'user' | 'shared';

interface Skill {
  id: string;          // unique key (owner + name)
  name: string;        // skill folder name
  owner: Owner;
  ownerLabel: string;
  description: string; // from frontmatter
  body: string;        // raw SKILL.md (capped)
  path: string;        // absolute path to SKILL.md
  // usage stats from JSONL (best-effort; many will be 0)
  invocations: number;       // total times invoked across all agents' sessions
  lastInvokedAt: string | null;
  invokedBy: Record<string, number>; // agent_id -> count
  errors: number;            // tool_use failures referencing this skill
}

const SKILL_DIRS: { dir: string; owner: Owner; ownerLabel: string }[] = [
  { dir: path.join(HOME, '.claude/skills'), owner: 'user', ownerLabel: 'User' },
  { dir: '/home/eve/workspaces/shared/skills', owner: 'shared', ownerLabel: 'Shared' },
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

function loadSkillsFromDir(dir: string, owner: Owner, ownerLabel: string): Skill[] {
  if (!fs.existsSync(dir)) return [];
  const out: Skill[] = [];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
    const skillDir = path.join(dir, ent.name);
    // Resolve symlinks safely
    let stat: fs.Stats;
    try { stat = fs.statSync(skillDir); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    let raw = '';
    try { raw = fs.readFileSync(skillFile, 'utf8'); } catch { continue; }
    const { fm, body } = parseFrontmatter(raw);
    const desc = fm.description || fm.summary || '';
    out.push({
      id: `${owner}/${ent.name}`,
      name: fm.name || ent.name,
      owner,
      ownerLabel,
      description: desc.slice(0, 400),
      body: body.slice(0, 50_000),
      path: skillFile,
      invocations: 0,
      lastInvokedAt: null,
      invokedBy: {},
      errors: 0,
    });
  }
  return out;
}

function scanSessionsForUsage(skills: Skill[]) {
  // Index by name (case-insensitive) for fast lookup. Multiple skills with the
  // same name (different owners) all get incremented — usage is per-name in JSONL.
  const byName = new Map<string, Skill[]>();
  for (const s of skills) {
    const k = s.name.toLowerCase();
    const arr = byName.get(k) || [];
    arr.push(s);
    byName.set(k, arr);
  }
  if (byName.size === 0) return;

  const projectsDir = path.join(HOME, '.claude/projects');
  if (!fs.existsSync(projectsDir)) return;

  const projectDirs = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(projectsDir, d.name));

  // Identify which agent a project dir belongs to. Project dirs are like
  // -home-eve-workspaces-wilson, -home-eve-workspaces-eve, etc.
  for (const pdir of projectDirs) {
    // Project dirs are like -home-eve-workspaces-<agent> — match the LAST
    // path-segment so we don't false-match (e.g. "-eve" inside another path).
    const agentId =
      AGENTS.find((a) => pdir.endsWith(`-${a.id}`))?.id || 'unknown';

    // JSONLs live directly in the project dir, not in a sessions/ subdir.
    let files: string[] = [];
    try {
      files = fs.readdirSync(pdir).filter((f) => f.endsWith('.jsonl'));
    } catch { continue; }

    // Cap at most-recent 50 files per agent; sufficient for usage signal.
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

        // Look for Skill tool invocations. Common shapes:
        //   {"type":"tool_use","name":"Skill","input":{"skill":"<name>"}}
        //   {"message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"<name>"}}]}}
        // Defensive: walk recursively to find tool_use blocks.
        const ts = evt.timestamp || evt.created_at || evt.message?.created_at || null;
        const toolUses = collectToolUses(evt);
        for (const tu of toolUses) {
          const name = tu.name || '';
          // Skill tool: input.skill is the skill name
          if (name === 'Skill' || name === 'skill') {
            const skillName: string = (tu.input?.skill || tu.input?.name || '').toLowerCase();
            if (!skillName) continue;
            const matches = byName.get(skillName);
            if (!matches) continue;
            for (const m of matches) {
              m.invocations++;
              m.invokedBy[agentId] = (m.invokedBy[agentId] || 0) + 1;
              if (ts && (!m.lastInvokedAt || ts > m.lastInvokedAt)) m.lastInvokedAt = ts;
            }
          }
          // Bash that calls a known skill script
          if (name === 'Bash' && tu.input?.command) {
            const cmd: string = tu.input.command;
            for (const [lname, arr] of byName.entries()) {
              if (cmd.toLowerCase().includes(`/${lname}/`) || cmd.toLowerCase().includes(`skills/${lname}`)) {
                for (const m of arr) {
                  m.invocations++;
                  m.invokedBy[agentId] = (m.invokedBy[agentId] || 0) + 1;
                  if (ts && (!m.lastInvokedAt || ts > m.lastInvokedAt)) m.lastInvokedAt = ts;
                }
              }
            }
          }
        }

        // Tool errors that mention a skill name
        const errText = JSON.stringify(evt.error || evt.message?.error || '');
        if (errText && errText.length < 5000) {
          for (const [lname, arr] of byName.entries()) {
            if (errText.toLowerCase().includes(`skill ${lname}`) || errText.toLowerCase().includes(`skill: ${lname}`)) {
              for (const m of arr) m.errors++;
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

function main() {
  const allSkills: Skill[] = [];
  for (const { dir, owner, ownerLabel } of SKILL_DIRS) {
    allSkills.push(...loadSkillsFromDir(dir, owner, ownerLabel));
  }
  console.log(`[prebuild] loaded ${allSkills.length} skills`);

  // De-dupe by id (collision-rare but possible if symlinks crisscross)
  const seen = new Map<string, Skill>();
  for (const s of allSkills) seen.set(s.id, s);
  const skills = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));

  scanSessionsForUsage(skills);
  const totalInvocations = skills.reduce((n, s) => n + s.invocations, 0);
  console.log(`[prebuild] usage scan complete — ${totalInvocations} invocations recorded`);

  // Per-agent matrix: which agents have which skills installed.
  // For each skill, build a presence map across agents based on whether the
  // skill exists in that agent's dir OR shared (which all agents see) OR user.
  const sharedNames = new Set(skills.filter((s) => s.owner === 'shared' || s.owner === 'user').map((s) => s.name.toLowerCase()));
  const agentNames: Record<string, Set<string>> = {};
  for (const a of AGENTS) {
    agentNames[a.id] = new Set(skills.filter((s) => s.owner === a.id).map((s) => s.name.toLowerCase()));
  }
  // Matrix entry: { skillName: { wilson: 'own'|'shared'|'absent', ... } }
  const allNames = Array.from(new Set(skills.map((s) => s.name)));
  const matrix: Record<string, Record<string, 'own' | 'shared' | 'user' | 'absent'>> = {};
  for (const name of allNames) {
    const lname = name.toLowerCase();
    matrix[name] = {};
    for (const a of AGENTS) {
      if (agentNames[a.id].has(lname)) matrix[name][a.id] = 'own';
      else if (sharedNames.has(lname)) matrix[name][a.id] = 'shared';
      else matrix[name][a.id] = 'absent';
    }
  }

  const out = {
    generated_at: new Date().toISOString(),
    agents: AGENTS,
    skills,
    matrix,
    totals: {
      skill_count: skills.length,
      invocation_count: totalInvocations,
      agents_with_skills: AGENTS.filter((a) => agentNames[a.id].size > 0).length,
    },
  };
  const outPath = path.join(__dirname, '..', 'src/data/skills.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`[prebuild] wrote ${outPath}`);
}

main();
