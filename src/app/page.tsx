'use client';

import { useState, useMemo, useEffect } from 'react';
import skillsData from '../data/skills.json';
import SkillCard from '../components/SkillCard';
import SkillModal from '../components/SkillModal';
import AgentMatrix from '../components/AgentMatrix';

type Skill = typeof skillsData.skills[number];
type View = 'grid' | 'matrix';

export default function Home() {
  const [view, setView] = useState<View>('grid');
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Skill | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'usage' | 'recent'>('name');

  // Esc closes modal
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = skillsData.skills.filter((s) => {
      if (ownerFilter === 'promote') {
        if (!s.isPromotionCandidate) return false;
      } else if (ownerFilter !== 'all' && s.owner !== ownerFilter) {
        return false;
      }
      if (agentFilter !== 'all') {
        // Show skills used by this agent OR owned by this agent OR present in their dir
        const usedBy = (s.invokedBy as Record<string, number>)[agentFilter] || 0;
        const ownedBy = s.owner === agentFilter;
        const inAgentDir = (s.locations || []).some((l) => l.owner === agentFilter);
        if (!usedBy && !ownedBy && !inAgentDir) return false;
      }
      if (!q) return true;
      const blob = (s.name + ' ' + s.description + ' ' + s.body).toLowerCase();
      return blob.includes(q);
    });
    if (sortBy === 'usage') arr = [...arr].sort((a, b) => b.invocations - a.invocations);
    else if (sortBy === 'recent') {
      arr = [...arr].sort((a, b) => {
        if (!a.lastInvokedAt && !b.lastInvokedAt) return a.name.localeCompare(b.name);
        if (!a.lastInvokedAt) return 1;
        if (!b.lastInvokedAt) return -1;
        return b.lastInvokedAt.localeCompare(a.lastInvokedAt);
      });
    }
    return arr;
  }, [search, ownerFilter, agentFilter, sortBy]);

  const totalInvocations = skillsData.totals.invocation_count;
  const skillCount = skillsData.totals.skill_count;
  const generatedAt = new Date(skillsData.generated_at).toLocaleString('en-GB', {
    timeZone: 'Europe/Oslo', dateStyle: 'medium', timeStyle: 'short',
  });

  return (
    <main className="relative z-10 max-w-[1500px] mx-auto px-6 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className="text-accent">$</span> skill-garden
          </h1>
          <p className="text-dim text-sm mt-2">
            {skillCount} skills · {totalInvocations.toLocaleString()} invocations across the household ·
            indexed {generatedAt} CET
            {skillsData.totals.promotion_candidate_count > 0 && (
              <>
                {' · '}
                <span style={{ color: '#FFD580' }}>
                  {skillsData.totals.promotion_candidate_count} promotion candidate{skillsData.totals.promotion_candidate_count === 1 ? '' : 's'}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setView('grid')}
            className={`px-3 py-1.5 border rounded-sm ${view === 'grid' ? 'border-accent text-accent bg-accent/5' : 'border-edge text-dim hover:text-ink hover:border-ink/30'}`}
          >grid</button>
          <button
            onClick={() => setView('matrix')}
            className={`px-3 py-1.5 border rounded-sm ${view === 'matrix' ? 'border-accent text-accent bg-accent/5' : 'border-edge text-dim hover:text-ink hover:border-ink/30'}`}
          >matrix</button>
        </div>
      </header>

      {view === 'grid' && (
        <>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
            <input
              type="text"
              placeholder="search name, description, body content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-panel border border-edge rounded-sm px-3 py-2 text-ink placeholder-dim outline-none focus:border-accent/60 focus:bg-bg"
              autoFocus
            />
            <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} className="bg-panel border border-edge rounded-sm px-2 py-2 text-sm">
              <option value="all">all owners</option>
              <option value="shared">shared</option>
              <option value="promote">promotion candidates</option>
              {skillsData.agents.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
            </select>
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className="bg-panel border border-edge rounded-sm px-2 py-2 text-sm">
              <option value="all">used/owned by anyone</option>
              {skillsData.agents.map((a) => (<option key={a.id} value={a.id}>used/owned by {a.label}</option>))}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="bg-panel border border-edge rounded-sm px-2 py-2 text-sm">
              <option value="name">sort: name</option>
              <option value="usage">sort: invocations</option>
              <option value="recent">sort: most recent</option>
            </select>
          </div>

          <p className="text-dim text-xs mb-4">
            {filtered.length} of {skillCount} skills shown
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((s) => (
              <SkillCard key={s.id} skill={s} onSelect={() => setSelected(s)} />
            ))}
            {filtered.length === 0 && (
              <p className="text-dim col-span-full py-12 text-center">no skills match these filters.</p>
            )}
          </div>
        </>
      )}

      {view === 'matrix' && (
        <AgentMatrix
          matrix={skillsData.matrix as any}
          agents={skillsData.agents as any}
          skills={skillsData.skills}
          onSelect={(skillName) => {
            const s = skillsData.skills.find((x) => x.name === skillName);
            if (s) setSelected(s);
          }}
        />
      )}

      <footer className="mt-16 pt-6 border-t border-edge text-xs text-dim flex justify-between">
        <span>Trollefsen household — nightly MVP 2026-04-29</span>
        <span>data: ~/.claude/skills · shared/skills · per-agent dirs · session JSONLs</span>
      </footer>

      {selected && (
        <SkillModal skill={selected} onClose={() => setSelected(null)} agents={skillsData.agents as any} />
      )}
    </main>
  );
}
